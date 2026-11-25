import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Cloud, CloudUpload, Loader2, LogOut, Menu, Search } from 'lucide-react';
import {
  BASE_SYSTEM_OVERLAYS,
  buildDefaultTemplates,
  createInitialEvents,
} from './data/initialData';
import {
  BankSyncUpdate,
  DEFAULT_INTERACTIVE_CONFIG,
  EventMetadata,
  InteractiveInviteConfig,
  NavTab,
  OverlayBlock,
  Recipient,
  SavedEventRecord,
  TemplateImages,
  WorkflowStepStatus,
} from './types';
import {
  StoredSystemDefault,
  clearSystemDefault,
  clearStudioDraft,
  loadSystemDefaultSync,
  loadSystemDefaultFromIdb,
  loadStudioDraft,
  saveSystemDefaultSync,
  saveSystemDefaultToIdb,
  saveStudioDraft,
  applyRsvpSubmissionToStorage,
} from './utils/storage';
import {
  buildSafePdfFilename,
  generateBatchZip,
  generateSingleRecipientPdf,
  triggerBlobDownload,
} from './utils/pdfEngine';
import {
  RSVP_BROADCAST_CHANNEL,
  RsvpSubmissionMessage,
  parseRsvpRoute,
} from './utils/rsvp';
import {
  isFirestoreRsvpConfigured,
  publishGuestInvitesToCloud,
  publishInviteConfigToCloud,
  publishSingleGuestInviteToCloud,
  sanitizeFirestoreId,
  submitRsvpToCloud,
  syncEventRsvpsFromCloud,
} from './utils/firebaseRsvp';
import { syncMasterBankWithCloud } from './utils/bankStorage';
import {
  computeWorkspaceContentSignature,
  recordDeletedEventTombstone,
  syncWorkspaceWithCloud,
} from './utils/workspaceCloudSync';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { WorkflowStepperBar } from './components/WorkflowStepperBar';
import { GuestRsvpPage } from './components/GuestRsvpPage';
import { FloatingToast } from './components/UiPolish';
import { IconBadge } from './components/BrandIcon';

const EventInfoTemplateView = lazy(() =>
  import('./components/EventInfoTemplateView').then((m) => ({
    default: m.EventInfoTemplateView,
  }))
);
const LayoutEditorView = lazy(() =>
  import('./components/LayoutEditorView').then((m) => ({
    default: m.LayoutEditorView,
  }))
);
const GuestListView = lazy(() =>
  import('./components/GuestListView').then((m) => ({
    default: m.GuestListView,
  }))
);
const BatchQueueView = lazy(() =>
  import('./components/BatchQueueView').then((m) => ({
    default: m.BatchQueueView,
  }))
);
const InvitationPreviewModal = lazy(() =>
  import('./components/InvitationPreviewModal').then((m) => ({
    default: m.InvitationPreviewModal,
  }))
);
const InteractiveInvitePage = lazy(() =>
  import('./components/InteractiveInvitePage').then((m) => ({
    default: m.InteractiveInvitePage,
  }))
);

function stripSalinanSuffix(name: string): string {
  const stripped = name.replace(/(?:\s*\(Salinan(?:\s+\d+)?\))+$/gi, '').trim();
  return stripped || name.trim();
}

function buildUniqueCopyName(sourceName: string, existingNames: Set<string>): string {
  const baseName = stripSalinanSuffix(sourceName);
  const firstCandidate = `${baseName} (Salinan)`;
  if (!existingNames.has(firstCandidate.toLowerCase())) {
    return firstCandidate;
  }
  let counter = 2;
  while (existingNames.has(`${baseName} (Salinan ${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${baseName} (Salinan ${counter})`;
}

function sanitizeStackedDuplicateEventNames(
  list: SavedEventRecord[]
): SavedEventRecord[] {
  const seen = new Set<string>();
  return list.map((ev) => {
    const rawName = ev.metadata.eventName || '';
    const hasStackedSalinan = /(?:\s*\(Salinan(?:\s+\d+)?\)){2,}$/i.test(rawName);
    if (!hasStackedSalinan) {
      seen.add(rawName.trim().toLowerCase());
      return ev;
    }
    const cleanName = buildUniqueCopyName(rawName, seen);
    seen.add(cleanName.toLowerCase());
    return {
      ...ev,
      metadata: {
        ...ev.metadata,
        eventName: cleanName,
      },
    };
  });
}

interface AppProps {
  adminEmail?: string | null;
  onSignOut?: () => Promise<void>;
}

export default function App({ adminEmail = null, onSignOut }: AppProps = {}) {
  const [urlRsvpPayload] = useState(() =>
    typeof window !== 'undefined'
      ? parseRsvpRoute(window.location.pathname, window.location.search)
      : null
  );
  const [simulatedRsvpRecipient, setSimulatedRsvpRecipient] =
    useState<Recipient | null>(null);
  const [simulatedInteractiveRecipient, setSimulatedInteractiveRecipient] =
    useState<Recipient | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [exportInitialSection, setExportInitialSection] = useState<
    'pdf' | 'links'
  >('pdf');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [events, setEvents] = useState<SavedEventRecord[]>(() =>
    createInitialEvents()
  );
  const [activeEventId, setActiveEventId] = useState<string>(
    'evt-default-active'
  );

  const activeEvent = useMemo(
    () => events.find((ev) => ev.id === activeEventId) ?? events[0],
    [events, activeEventId]
  );

  const metadata = activeEvent.metadata;
  const templates = activeEvent.templates;
  const overlays = activeEvent.overlays;
  const recipients = activeEvent.recipients;
  const interactiveConfig = useMemo<InteractiveInviteConfig>(
    () => ({ ...DEFAULT_INTERACTIVE_CONFIG, ...activeEvent.interactiveConfig }),
    [activeEvent.interactiveConfig]
  );

  const setInteractiveConfig = useCallback(
    (next: InteractiveInviteConfig) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === activeEvent.id
            ? { ...ev, interactiveConfig: next, updatedAt: Date.now() }
            : ev
        )
      );
    },
    [activeEvent.id]
  );

  const stepStatus = useMemo<WorkflowStepStatus>(
    () => ({
      infoReady: Boolean(metadata.eventName.trim() && templates.page1DataUrl),
      guestsReady: recipients.length > 0,
      layoutReady:
        Boolean(templates.page1DataUrl) &&
        overlays.some((o) => o.visible) &&
        recipients.length > 0,
      exportReady:
        recipients.length > 0 &&
        recipients.some((r) => r.status === 'generated'),
    }),
    [metadata.eventName, templates.page1DataUrl, recipients, overlays]
  );

  const updateActiveEvent = useCallback(
    (updater: (current: SavedEventRecord) => SavedEventRecord) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === activeEvent.id
            ? { ...updater(ev), updatedAt: Date.now() }
            : ev
        )
      );
    },
    [activeEvent.id]
  );

  const setMetadata = useCallback(
    (next: EventMetadata) => {
      updateActiveEvent((ev) => ({ ...ev, metadata: next }));
    },
    [updateActiveEvent]
  );

  const setTemplates = useCallback(
    (next: TemplateImages) => {
      updateActiveEvent((ev) => ({ ...ev, templates: next }));
    },
    [updateActiveEvent]
  );

  const setOverlays = useCallback(
    (next: OverlayBlock[]) => {
      updateActiveEvent((ev) => ({ ...ev, overlays: next }));
    },
    [updateActiveEvent]
  );

  const setRecipients = useCallback(
    (updater: Recipient[] | ((prev: Recipient[]) => Recipient[])) => {
      updateActiveEvent((ev) => ({
        ...ev,
        recipients:
          typeof updater === 'function' ? updater(ev.recipients) : updater,
      }));
    },
    [updateActiveEvent]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('Semua');

  const [previewRecipientId, setPreviewRecipientId] = useState<string>(
    () => activeEvent.recipients[0]?.id ?? ''
  );
  const [modalTarget, setModalTarget] = useState<{
    recipientId: string;
    fallback: Recipient;
  } | null>(null);
  const [modalPreviewPage, setModalPreviewPage] = useState<1 | 2>(1);
  const [systemDefaultState, setSystemDefaultState] =
    useState<StoredSystemDefault | null>(() => loadSystemDefaultSync());
  const systemDefaultOverlays = systemDefaultState?.overlays ?? null;

  // Derive live modalRecipient so edits/bank-syncs appear immediately in Full Preview
  const modalRecipient = useMemo<Recipient | null>(() => {
    if (!modalTarget) return null;
    return (
      recipients.find((r) => r.id === modalTarget.recipientId) ??
      modalTarget.fallback
    );
  }, [modalTarget, recipients]);

  // Keep previewRecipientId valid whenever active event's recipients change
  useEffect(() => {
    if (recipients.length === 0) {
      if (previewRecipientId !== '') setPreviewRecipientId('');
      return;
    }
    if (!recipients.some((r) => r.id === previewRecipientId)) {
      setPreviewRecipientId(recipients[0].id);
    }
  }, [recipients, previewRecipientId]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProcessedCount, setBatchProcessedCount] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  const [currentGeneratingName, setCurrentGeneratingName] = useState('');

  const [toast, setToast] = useState<{
    id: number;
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const zipResultRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const pdfCacheRef = useRef<Map<string, { filename: string; bytes: Uint8Array }>>(
    new Map()
  );
  const [hasReadyZip, setHasReadyZip] = useState(false);
  const draftLoadedRef = useRef(false);
  const hadLocalDraftRef = useRef(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [workspaceSyncStatus, setWorkspaceSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'unsaved' | 'error'
  >('idle');
  const workspaceSyncInFlightRef = useRef(false);
  const initialCloudWorkspaceSyncedRef = useRef(false);
  const lastSyncedWorkspaceSigRef = useRef<string>('');
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const activeEventIdRef = useRef(activeEventId);
  activeEventIdRef.current = activeEventId;

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ id: Date.now() + Math.random(), message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Global keyboard shortcuts: '/' focuses search, 'Escape' closes preview modal or clears search focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalTarget) {
          setModalTarget(null);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        return;
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          (document.activeElement as HTMLElement | null)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalTarget]);

  // Load persisted multi-event draft & full System Default from IndexedDB on mount
  useEffect(() => {
    let active = true;
    Promise.all([loadStudioDraft(), loadSystemDefaultFromIdb()])
      .then(([draft, idbDefault]) => {
        if (!active) return;

        // Reconcile System Default across localStorage & IndexedDB (prefer IDB on tie for full templates)
        const lsDefault = loadSystemDefaultSync();
        let effectiveDefault: StoredSystemDefault | null = lsDefault;
        if (
          idbDefault &&
          (!lsDefault || idbDefault.savedAt >= lsDefault.savedAt)
        ) {
          effectiveDefault = idbDefault;
          saveSystemDefaultSync(idbDefault);
        } else if (lsDefault && !idbDefault) {
          void saveSystemDefaultToIdb(lsDefault);
        }

        if (effectiveDefault) {
          setSystemDefaultState(effectiveDefault);
        }

        if (draft && draft.events.length > 0) {
          hadLocalDraftRef.current = true;
          const validActive =
            draft.events.find((e) => e.id === draft.activeEventId) ??
            draft.events[0];

          const shouldApplyDefault =
            Boolean(effectiveDefault) &&
            effectiveDefault!.savedAt >= validActive.updatedAt;

          const nextEvents = shouldApplyDefault
            ? draft.events.map((ev) => {
                if (ev.id !== validActive.id) return ev;
                const nextTemplates = effectiveDefault!.templates
                  ? { ...effectiveDefault!.templates }
                  : ev.templates;
                const singlePageOnly =
                  nextTemplates.pageCount === 1 || !nextTemplates.page2DataUrl;
                return {
                  ...ev,
                  metadata: effectiveDefault!.metadata
                    ? { ...effectiveDefault!.metadata }
                    : ev.metadata,
                  templates: nextTemplates,
                  overlays: effectiveDefault!.overlays.map((o) => ({
                    ...o,
                    page: singlePageOnly ? 1 : o.page,
                  })),
                };
              })
            : draft.events;

          setEvents(sanitizeStackedDuplicateEventNames(nextEvents));
          setActiveEventId(validActive.id);
          if (validActive.recipients[0]) {
            setPreviewRecipientId(validActive.recipients[0].id);
          }
        } else if (effectiveDefault) {
          const fresh = createInitialEvents(effectiveDefault);
          setEvents(fresh);
          setActiveEventId(fresh[0].id);
          if (fresh[0]?.recipients[0]) {
            setPreviewRecipientId(fresh[0].recipients[0].id);
          }
        }
      })
      .finally(() => {
        draftLoadedRef.current = true;
        setIsDraftLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Hydrate & reconcile Master Bank from Cloud Firestore automatically when admin session is active
  useEffect(() => {
    if (urlRsvpPayload || !adminEmail || !isFirestoreRsvpConfigured()) return;
    let active = true;
    void syncMasterBankWithCloud()
      .then((res) => {
        if (!active) return;
        if (res.action === 'pulled') {
          showToast('Bank Daftar Undangan disinkronkan dari penyimpanan Cloud.');
        }
      })
      .catch(() => {
        // Silent background fallback; detailed status & retry action appear inside Bank Daftar modal
      });
    return () => {
      active = false;
    };
  }, [urlRsvpPayload, adminEmail, showToast]);

  // Debounced auto-save to IndexedDB whenever events or activeEventId change (Admin mode only)
  useEffect(() => {
    if (urlRsvpPayload || !draftLoadedRef.current) return;
    const timer = setTimeout(() => {
      saveStudioDraft({
        activeEventId,
        events,
        updatedAt: Date.now(),
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [urlRsvpPayload, activeEventId, events]);

  // Content signature (ignores transient PDF render statuses so Generate PDF never wastes Cloud writes)
  const workspaceContentSig = useMemo(
    () => computeWorkspaceContentSignature(events, activeEventId),
    [events, activeEventId]
  );

  const runWorkspaceCloudSync = useCallback(
    async (opts?: { manual?: boolean; isInitial?: boolean }) => {
      if (
        urlRsvpPayload ||
        !adminEmail ||
        !isFirestoreRsvpConfigured() ||
        workspaceSyncInFlightRef.current
      ) {
        return;
      }

      workspaceSyncInFlightRef.current = true;
      setWorkspaceSyncStatus('syncing');
      try {
        const result = await syncWorkspaceWithCloud({
          localEvents: eventsRef.current,
          localActiveEventId: activeEventIdRef.current,
          isUntouchedFreshBrowser: Boolean(
            opts?.isInitial && !hadLocalDraftRef.current
          ),
          pushLocalChanges: true,
        });
        if (!result) {
          setWorkspaceSyncStatus('idle');
          return;
        }

        if (result.changedLocally && result.events.length > 0) {
          const cleaned = sanitizeStackedDuplicateEventNames(result.events);
          const nextActive =
            cleaned.find((e) => e.id === result.activeEventId)?.id ??
            cleaned[0].id;
          hadLocalDraftRef.current = true;
          eventsRef.current = cleaned;
          activeEventIdRef.current = nextActive;
          lastSyncedWorkspaceSigRef.current = computeWorkspaceContentSignature(
            cleaned,
            nextActive
          );
          setEvents(cleaned);
          setActiveEventId(nextActive);
          const activeRec = cleaned.find((e) => e.id === nextActive);
          if (activeRec?.recipients[0]) {
            setPreviewRecipientId(activeRec.recipients[0].id);
          }
          await saveStudioDraft({
            activeEventId: nextActive,
            events: cleaned,
            updatedAt: Date.now(),
          });
        } else {
          lastSyncedWorkspaceSigRef.current = computeWorkspaceContentSignature(
            eventsRef.current,
            activeEventIdRef.current
          );
        }

        setWorkspaceSyncStatus('synced');

        if (opts?.manual) {
          if (result.pulledCount > 0 && result.pushedCount > 0) {
            showToast(
              `Sinkron Cloud selesai: ${result.pushedCount} disimpan, ${result.pulledCount} dimuat dari PC lain.`
            );
          } else if (result.pulledCount > 0) {
            showToast(
              `${result.pulledCount} acara terbaru berhasil dimuat dari Cloud.`
            );
          } else if (result.pushedCount > 0 || result.deletedCount > 0) {
            showToast(
              'Semua perubahan acara tersimpan ke Cloud (dapat dibuka di PC lain).'
            );
          } else {
            showToast('Semua acara sudah sinkron dengan Cloud.');
          }
        } else if (opts?.isInitial && result.pulledCount > 0) {
          showToast(
            `${result.pulledCount} acara undangan disinkronkan dari Cloud.`
          );
        }
      } catch (err) {
        setWorkspaceSyncStatus('error');
        if (opts?.manual) {
          showToast(
            err instanceof Error
              ? err.message
              : 'Gagal menyinkronkan acara ke Cloud.',
            'error'
          );
        }
      } finally {
        workspaceSyncInFlightRef.current = false;
      }
    },
    [urlRsvpPayload, adminEmail, showToast]
  );

  // Pull & reconcile Cross-PC Workspace Events from Cloud once after local draft loads
  useEffect(() => {
    if (
      urlRsvpPayload ||
      !isDraftLoaded ||
      !adminEmail ||
      !isFirestoreRsvpConfigured() ||
      initialCloudWorkspaceSyncedRef.current
    ) {
      return;
    }
    initialCloudWorkspaceSyncedRef.current = true;
    void runWorkspaceCloudSync({ isInitial: true });
  }, [urlRsvpPayload, isDraftLoaded, adminEmail, runWorkspaceCloudSync]);

  // Ultra-frugal idle auto-sync: waits 6 seconds after last real edit so typing/importing = 1 single write
  useEffect(() => {
    if (
      urlRsvpPayload ||
      !isDraftLoaded ||
      !adminEmail ||
      !isFirestoreRsvpConfigured() ||
      !initialCloudWorkspaceSyncedRef.current
    ) {
      return;
    }
    if (
      !lastSyncedWorkspaceSigRef.current ||
      workspaceContentSig === lastSyncedWorkspaceSigRef.current
    ) {
      return;
    }
    setWorkspaceSyncStatus((prev) => (prev === 'syncing' ? prev : 'unsaved'));
    const timer = window.setTimeout(() => {
      void runWorkspaceCloudSync({ manual: false });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [
    urlRsvpPayload,
    isDraftLoaded,
    adminEmail,
    workspaceContentSig,
    runWorkspaceCloudSync,
  ]);

  // Listen to BroadcastChannel for live cross-tab RSVP submissions
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(RSVP_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<RsvpSubmissionMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'rsvp_updated') return;
      setEvents((prev) =>
        prev.map((ev) => {
          if (msg.eventId && ev.id !== msg.eventId) return ev;
          return {
            ...ev,
            recipients: ev.recipients.map((rec) =>
              rec.invitationCode.toLowerCase() === msg.invitationCode.toLowerCase()
                ? {
                    ...rec,
                    rsvpStatus: msg.rsvpStatus,
                    rsvpRepresentative: msg.rsvpRepresentative,
                    rsvpNote: msg.rsvpNote,
                    rsvpAt: msg.rsvpAt,
                  }
                : rec
            ),
            updatedAt: Date.now(),
          };
        })
      );
      showToast(`Konfirmasi RSVP diterima untuk kode ${msg.invitationCode}.`);
    };
    return () => channel.close();
  }, [showToast]);

  // Clear cached PDFs whenever active event design/metadata/overlays change
  useEffect(() => {
    pdfCacheRef.current.clear();
    zipResultRef.current = null;
    setHasReadyZip(false);
  }, [activeEventId, metadata, templates, overlays]);

  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of recipients) {
      const g = rec.group?.trim() || 'Lainnya / Manual';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipients.filter((rec) => {
      const recGroup = rec.group?.trim() || 'Lainnya / Manual';
      const matchesGroup = groupFilter === 'Semua' || recGroup === groupFilter;
      const matchesSearch =
        !q ||
        rec.recipientName.toLowerCase().includes(q) ||
        rec.institution.toLowerCase().includes(q) ||
        rec.invitationCode.toLowerCase().includes(q) ||
        recGroup.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [recipients, searchQuery, groupFilter]);

  const readyCount = useMemo(
    () => recipients.filter((r) => r.status !== 'generated').length,
    [recipients]
  );

  // Event History Handlers
  const handleSelectEvent = (eventId: string) => {
    const found = events.find((e) => e.id === eventId);
    if (!found) return;
    setActiveEventId(found.id);
    setGroupFilter('Semua');
    setPreviewRecipientId(found.recipients[0]?.id ?? '');
    showToast(`Membuka proyek "${found.metadata.eventName}"`);
  };

  const handleCreateEvent = (newMeta: EventMetadata) => {
    const nextTemplates = buildDefaultTemplates(newMeta, systemDefaultState);
    const singlePageOnly =
      nextTemplates.pageCount === 1 || !nextTemplates.page2DataUrl;
    const now = Date.now();
    const newId = `evt-${now}`;

    const newRecord: SavedEventRecord = {
      id: newId,
      metadata: { ...newMeta },
      templates: nextTemplates,
      overlays: (systemDefaultOverlays ?? BASE_SYSTEM_OVERLAYS).map((o) => ({
        ...o,
        page: singlePageOnly ? 1 : o.page,
      })),
      recipients: [
        {
          id: `rec-${now}-1`,
          salutation: 'Kepada Yth.',
          recipientName: 'Tamu Kehormatan',
          institution: newMeta.organizer,
          invitationCode: 'RI-001',
          status: 'ready',
        },
      ],
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    setEvents((prev) => [newRecord, ...prev]);
    setActiveEventId(newId);
    setPreviewRecipientId(newRecord.recipients[0].id);
    setActiveTab('info');
    showToast(`Event baru "${newMeta.eventName}" dibuat. Lengkapi Info & Template di Tahap 1.`);
  };

  const handleDuplicateEvent = (eventId: string) => {
    const source = events.find((e) => e.id === eventId);
    if (!source) return;
    const now = Date.now();
    const copyId = `evt-copy-${now}`;

    const existingNames = new Set(
      events.map((e) => e.metadata.eventName.trim().toLowerCase())
    );
    const nextCopyName = buildUniqueCopyName(
      source.metadata.eventName,
      existingNames
    );

    const cloned: SavedEventRecord = {
      id: copyId,
      metadata: {
        ...source.metadata,
        eventName: nextCopyName,
      },
      templates: { ...source.templates },
      overlays: source.overlays.map((o) => ({ ...o })),
      interactiveConfig: source.interactiveConfig
        ? { ...source.interactiveConfig }
        : undefined,
      recipients: source.recipients.map((r, idx) => ({
        ...r,
        id: `rec-copy-${now}-${idx}`,
        status: 'ready',
        generatedAt: undefined,
      })),
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    setEvents((prev) => [cloned, ...prev]);
    setActiveEventId(copyId);
    setPreviewRecipientId(cloned.recipients[0]?.id ?? '');
    showToast(`Berhasil menduplikat "${source.metadata.eventName}".`);
  };

  const handleToggleEventCompleted = (eventId: string) => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === eventId
          ? { ...ev, isCompleted: !ev.isCompleted, updatedAt: Date.now() }
          : ev
      )
    );
  };

  const handleDeleteEvent = (eventId: string) => {
    if (events.length <= 1) return;
    recordDeletedEventTombstone(eventId);
    const remaining = events.filter((e) => e.id !== eventId);
    setEvents(remaining);
    if (activeEventId === eventId && remaining[0]) {
      setActiveEventId(remaining[0].id);
      setPreviewRecipientId(remaining[0].recipients[0]?.id ?? '');
    }
    showToast('Event dihapus dari daftar riwayat.');
  };

  const handleDownloadSinglePdf = async (recipient: Recipient) => {
    setDownloadingId(recipient.id);
    try {
      // Ensure short /r/{eventId}/{code} QR codes hydrate guest & event info from Cloud Firestore
      if (isFirestoreRsvpConfigured() && adminEmail) {
        void Promise.allSettled([
          publishInviteConfigToCloud(activeEvent.id, interactiveConfig, metadata),
          publishSingleGuestInviteToCloud(activeEvent.id, recipient),
        ]);
      }

      const cached = pdfCacheRef.current.get(recipient.id);
      let bytes: Uint8Array;
      let filename: string;

      if (cached) {
        bytes = cached.bytes;
        filename = cached.filename;
      } else {
        bytes = await generateSingleRecipientPdf({
          eventId: activeEvent.id,
          metadata,
          templates,
          overlays,
          recipient,
        });
        filename = buildSafePdfFilename(
          metadata.eventName,
          recipient.recipientName,
          recipient.institution
        );
        pdfCacheRef.current.set(recipient.id, { filename, bytes });
      }

      triggerBlobDownload(bytes, filename, 'application/pdf');
      setRecipients((prev) =>
        prev.map((r) =>
          r.id === recipient.id
            ? { ...r, status: 'generated', generatedAt: Date.now() }
            : r
        )
      );
      showToast(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat berkas PDF.',
        'error'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStartBatchExport = async () => {
    const targets = filteredRecipients.length > 0 ? filteredRecipients : recipients;
    if (targets.length === 0 || isGeneratingBatch) return;

    setActiveTab('export');
    setIsGeneratingBatch(true);
    setBatchProcessedCount(0);
    setBatchTotalCount(targets.length);
    setHasReadyZip(false);

    try {
      // Sync event metadata & all target guest cards in parallel so short QR codes resolve online
      const cloudSyncPromise =
        isFirestoreRsvpConfigured() && adminEmail
          ? Promise.allSettled([
              publishInviteConfigToCloud(activeEvent.id, interactiveConfig, metadata),
              publishGuestInvitesToCloud(activeEvent.id, targets),
            ])
          : Promise.resolve();

      const [{ zipBlob, zipFilename }] = await Promise.all([
        generateBatchZip({
          eventId: activeEvent.id,
          metadata,
          templates,
          overlays,
          recipients: targets,
          onItemStart: (recipientId, idx) => {
            const r = targets[idx];
            setCurrentGeneratingName(r?.recipientName ?? '');
            setRecipients((prev) =>
              prev.map((item) =>
                item.id === recipientId ? { ...item, status: 'generating' } : item
              )
            );
          },
          onItemDone: (recipientId, filename, bytes, idx) => {
            pdfCacheRef.current.set(recipientId, { filename, bytes });
            setBatchProcessedCount(idx + 1);
            setRecipients((prev) =>
              prev.map((item) =>
                item.id === recipientId
                  ? { ...item, status: 'generated', generatedAt: Date.now() }
                  : item
              )
            );
          },
        }),
        cloudSyncPromise,
      ]);

      zipResultRef.current = { blob: zipBlob, filename: zipFilename };
      setHasReadyZip(true);
      triggerBlobDownload(zipBlob, zipFilename, 'application/zip');
      showToast(`${targets.length} PDF individual berhasil dikemas ke ${zipFilename}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat ekspor batch ZIP.',
        'error'
      );
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  const handleDownloadZipArchive = () => {
    if (!zipResultRef.current) return;
    triggerBlobDownload(
      zipResultRef.current.blob,
      zipResultRef.current.filename,
      'application/zip'
    );
    showToast(`Mengunduh arsip ${zipResultRef.current.filename}`);
  };

  const handleSaveAsDefaultSystem = async () => {
    const savedAt = Date.now();
    const saved = saveSystemDefaultSync({
      overlays: overlays.map((o) => ({ ...o })),
      metadata: { ...metadata },
      templates: { ...templates },
      savedAt,
    });
    setSystemDefaultState(saved);
    await saveSystemDefaultToIdb(saved);

    // Flush active draft immediately so refreshing right away keeps everything in sync
    const nextEvents = events.map((ev) =>
      ev.id === activeEvent.id
        ? {
            ...ev,
            metadata: { ...metadata },
            templates: { ...templates },
            overlays: saved.overlays.map((o) => ({ ...o })),
            updatedAt: savedAt,
          }
        : ev
    );
    setEvents(nextEvents);
    await saveStudioDraft({
      activeEventId,
      events: nextEvents,
      updatedAt: savedAt,
    });

    showToast(
      'Kondisi & pengaturan saat ini disimpan sebagai Default Sistem.'
    );
  };

  const handleCopySystemDefaultJson = async () => {
    const exportPayload = {
      metadata: { ...metadata },
      templatesInfo: {
        pageCount: templates.pageCount,
        page1Width: templates.page1Width,
        page1Height: templates.page1Height,
        hasPage2: Boolean(templates.page2DataUrl),
        page2Width: templates.page2Width,
        page2Height: templates.page2Height,
      },
      overlays: overlays.map((o) => ({ ...o })),
    };
    const jsonText = JSON.stringify(exportPayload, null, 2);

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonText);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = jsonText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      showToast('JSON pengaturan saat ini disalin ke clipboard.');
    } else {
      showToast('Gagal menyalin JSON ke clipboard.', 'error');
    }
  };

  const handleClearSystemDefault = async () => {
    await clearSystemDefault();
    setSystemDefaultState(null);
    showToast('Default Sistem tersimpan dihapus.');
  };

  const handleResetOverlays = () => {
    const source =
      systemDefaultOverlays && systemDefaultOverlays.length > 0
        ? systemDefaultOverlays
        : BASE_SYSTEM_OVERLAYS;
    const singlePageOnly =
      templates.pageCount === 1 || !templates.page2DataUrl;
    setOverlays(
      source.map((o) => ({
        ...o,
        page: singlePageOnly ? 1 : o.page,
      }))
    );
    showToast(
      systemDefaultOverlays
        ? 'Tata letak dikembalikan ke Default Sistem Anda.'
        : 'Tata letak dikembalikan ke posisi awal.'
    );
  };

  const handleResetWorkspace = async () => {
    await clearStudioDraft();
    const initial = createInitialEvents(systemDefaultState, {
      emptyRecipients: true,
    });
    const now = Date.now();
    setEvents(initial);
    setActiveEventId(initial[0].id);
    setPreviewRecipientId('');
    setSearchQuery('');
    setGroupFilter('Semua');
    pdfCacheRef.current.clear();
    zipResultRef.current = null;
    setHasReadyZip(false);
    await saveStudioDraft({
      activeEventId: initial[0].id,
      events: initial,
      updatedAt: now,
    });
    showToast('Draf direset: seluruh daftar penerima undangan telah dikosongkan.');
  };

  const handleAddRecipient = (data: Omit<Recipient, 'id' | 'status'>) => {
    const newRec: Recipient = {
      ...data,
      id: `rec-${Date.now()}`,
      status: 'ready',
    };
    setRecipients((prev) => [newRec, ...prev]);
    setPreviewRecipientId(newRec.id);
    showToast(`Penerima "${newRec.recipientName}" ditambahkan.`);
  };

  const handleUpdateRecipient = (id: string, patch: Partial<Recipient>) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    pdfCacheRef.current.delete(id);
    showToast('Data penerima diperbarui.');
  };

  const handleDeleteRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    pdfCacheRef.current.delete(id);
    showToast('Penerima dihapus dari daftar.');
  };

  const handleBulkDeleteByGroup = (targetGroup: string) => {
    if (targetGroup === 'Semua') {
      setRecipients([]);
      pdfCacheRef.current.clear();
      setPreviewRecipientId('');
      showToast('Seluruh daftar penerima undangan pada event ini dikosongkan.');
      return;
    }
    setRecipients((prev) =>
      prev.filter((r) => (r.group?.trim() || 'Lainnya / Manual') !== targetGroup)
    );
    setGroupFilter('Semua');
    pdfCacheRef.current.clear();
    showToast(`Kelompok "${targetGroup}" dihapus dari daftar penerima.`);
  };

  const handleApplyPdfSelection = (
    selected: Recipient[],
    mode: 'append' | 'replace'
  ) => {
    if (selected.length === 0) return;
    const stamp = Date.now();

    if (mode === 'replace') {
      const fresh = selected.map((r, i) => ({
        ...r,
        id: `pdf-pick-${stamp}-${i}`,
        status: 'ready' as const,
      }));
      setRecipients(fresh);
      setGroupFilter('Semua');
      pdfCacheRef.current.clear();
      if (fresh[0]) setPreviewRecipientId(fresh[0].id);
      showToast(`${fresh.length} penerima terpilih berhasil dipasang ke daftar undangan.`);
      return;
    }

    const existingKeys = new Set(
      recipients.map(
        (r) =>
          `${r.recipientName.toLowerCase()}||${r.institution.toLowerCase()}||${r.group ?? ''}`
      )
    );
    const toAdd = selected
      .filter(
        (r) =>
          !existingKeys.has(
            `${r.recipientName.toLowerCase()}||${r.institution.toLowerCase()}||${r.group ?? ''}`
          )
      )
      .map((r, i) => ({
        ...r,
        id: `pdf-pick-${stamp}-${i}`,
        status: 'ready' as const,
      }));

    if (toAdd.length === 0) {
      showToast('Semua penerima yang dicentang sudah ada di dalam daftar saat ini.');
      return;
    }

    setRecipients((prev) => [...prev, ...toAdd]);
    const skipped = selected.length - toAdd.length;
    showToast(
      skipped > 0
        ? `${toAdd.length} penerima baru ditambahkan (${skipped} sudah ada di daftar).`
        : `${toAdd.length} penerima terpilih berhasil ditambahkan ke daftar.`
    );
  };

  const handleSyncBankUpdates = useCallback(
    (updates: BankSyncUpdate[]): number => {
      if (updates.length === 0) return 0;

      const byCode = new Map<string, BankSyncUpdate['next']>();
      const byIdentity = new Map<string, BankSyncUpdate['next']>();
      for (const u of updates) {
        if (u.previousKey.invitationCode) {
          byCode.set(u.previousKey.invitationCode.trim().toLowerCase(), u.next);
        }
        const identity = `${u.previousKey.recipientName.trim().toLowerCase()}||${u.previousKey.institution.trim().toLowerCase()}||${(u.previousKey.group ?? '').trim().toLowerCase()}`;
        byIdentity.set(identity, u.next);
      }

      let matchedCount = 0;
      const updatedIds: string[] = [];

      const nextRecipients = recipients.map((rec) => {
        const codeKey = rec.invitationCode.trim().toLowerCase();
        const identityKey = `${rec.recipientName.trim().toLowerCase()}||${rec.institution.trim().toLowerCase()}||${(rec.group ?? '').trim().toLowerCase()}`;
        const patch = byIdentity.get(identityKey) ?? byCode.get(codeKey);
        if (!patch) return rec;

        matchedCount += 1;
        updatedIds.push(rec.id);
        return {
          ...rec,
          salutation: patch.salutation,
          recipientName: patch.recipientName,
          institution: patch.institution,
          placeLabel: patch.placeLabel,
          group: patch.group,
        };
      });

      if (matchedCount > 0) {
        setRecipients(nextRecipients);
        updatedIds.forEach((id) => pdfCacheRef.current.delete(id));
        zipResultRef.current = null;
        setHasReadyZip(false);
      }

      return matchedCount;
    },
    [recipients, setRecipients]
  );

  const handleBulkImport = (imported: Recipient[], mode: 'append' | 'replace') => {
    if (mode === 'replace') {
      setRecipients(imported);
      setGroupFilter('Semua');
      if (imported[0]) setPreviewRecipientId(imported[0].id);
    } else {
      setRecipients((prev) => [...imported, ...prev]);
    }
    showToast(`${imported.length} penerima berhasil diimpor ke daftar.`);
  };

  const handlePreviewRecipient = (recipient: Recipient, page: 1 | 2 = 1) => {
    setPreviewRecipientId(recipient.id);
    setModalPreviewPage(page);
    setModalTarget({ recipientId: recipient.id, fallback: recipient });
  };

  const [isSyncingCloudRsvp, setIsSyncingCloudRsvp] = useState(false);
  const cloudRsvpEnabled = isFirestoreRsvpConfigured();

  const handleSyncCloudRsvp = useCallback(
    async (silent = false) => {
      if (!cloudRsvpEnabled || isSyncingCloudRsvp) return;
      setIsSyncingCloudRsvp(true);
      const cursorKey = 'ranahinvite_rsvp_sync_cursor_v1';
      try {
        let cursors: Record<string, number> = {};
        try {
          const raw = localStorage.getItem(cursorKey);
          if (raw) cursors = JSON.parse(raw) as Record<string, number>;
        } catch {
          cursors = {};
        }

        const lastSyncedAt = cursors[activeEvent.id] ?? 0;
        const { updates, maxUpdatedAt } = await syncEventRsvpsFromCloud(
          activeEvent.id,
          lastSyncedAt
        );

        if (updates.length > 0) {
          const updateMap = new Map(
            updates.map((u) => [u.invitationCode.toLowerCase(), u])
          );
          setEvents((prev) =>
            prev.map((ev) => {
              if (ev.id !== activeEvent.id) return ev;
              return {
                ...ev,
                recipients: ev.recipients.map((rec) => {
                  const key = sanitizeFirestoreId(
                    rec.invitationCode,
                    40
                  ).toLowerCase();
                  const hit =
                    updateMap.get(key) ??
                    updateMap.get(rec.invitationCode.trim().toLowerCase());
                  if (!hit) return rec;
                  if (rec.rsvpAt && rec.rsvpAt >= hit.updatedAt) return rec;
                  return {
                    ...rec,
                    rsvpStatus: hit.status,
                    rsvpRepresentative: hit.representative || undefined,
                    rsvpNote: hit.note || undefined,
                    rsvpAt: hit.updatedAt,
                  };
                }),
                updatedAt: Date.now(),
              };
            })
          );

          cursors[activeEvent.id] = maxUpdatedAt;
          try {
            localStorage.setItem(cursorKey, JSON.stringify(cursors));
          } catch {
            // ignore quota errors
          }

          if (!silent) {
            showToast(
              `${updates.length} konfirmasi RSVP baru berhasil disinkronkan dari Cloud.`
            );
          }
        } else if (!silent) {
          showToast('Semua data konfirmasi RSVP sudah terbaru.');
        }
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error
              ? err.message
              : 'Gagal menyinkronkan RSVP dari Cloud Firestore.',
            'error'
          );
        }
      } finally {
        setIsSyncingCloudRsvp(false);
      }
    },
    [activeEvent.id, cloudRsvpEnabled, isSyncingCloudRsvp, showToast]
  );

  useEffect(() => {
    if (!cloudRsvpEnabled || !isDraftLoaded) return;
    void handleSyncCloudRsvp(true);
    // Only run 1 incremental sync automatically after local draft is loaded or when switching active event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent.id, cloudRsvpEnabled, isDraftLoaded]);

  const handleRsvpSubmit = async (
    eventId: string,
    invitationCode: string,
    data: {
      status: 'attending' | 'represented' | 'declined';
      representative?: string;
      note?: string;
    }
  ) => {
    const rsvpAt = Date.now();
    setEvents((prev) =>
      prev.map((ev) => {
        if (eventId && ev.id !== eventId) return ev;
        return {
          ...ev,
          recipients: ev.recipients.map((rec) =>
            rec.invitationCode.toLowerCase() === invitationCode.toLowerCase()
              ? {
                  ...rec,
                  rsvpStatus: data.status,
                  rsvpRepresentative: data.representative,
                  rsvpNote: data.note,
                  rsvpAt,
                }
              : rec
          ),
          updatedAt: rsvpAt,
        };
      })
    );

    if (cloudRsvpEnabled && eventId) {
      try {
        await submitRsvpToCloud(eventId, invitationCode, {
          status: data.status,
          representative: data.representative,
          note: data.note,
          updatedAt: rsvpAt,
        });
      } catch (err) {
        console.warn('Firestore RSVP sync skipped:', err);
      }
    }

    await applyRsvpSubmissionToStorage(eventId, invitationCode, {
      rsvpStatus: data.status,
      rsvpRepresentative: data.representative,
      rsvpNote: data.note,
      rsvpAt,
    });

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(RSVP_BROADCAST_CHANNEL);
      const msg: RsvpSubmissionMessage = {
        type: 'rsvp_updated',
        eventId,
        invitationCode,
        rsvpStatus: data.status,
        rsvpRepresentative: data.representative,
        rsvpNote: data.note,
        rsvpAt,
      };
      ch.postMessage(msg);
      ch.close();
    }

    if (simulatedRsvpRecipient) {
      setSimulatedRsvpRecipient((prev) =>
        prev
          ? {
              ...prev,
              rsvpStatus: data.status,
              rsvpRepresentative: data.representative,
              rsvpNote: data.note,
              rsvpAt,
            }
          : null
      );
      showToast(`Konfirmasi kehadiran "${simulatedRsvpRecipient.recipientName}" tercatat.`);
    }

    if (simulatedInteractiveRecipient) {
      setSimulatedInteractiveRecipient((prev) =>
        prev
          ? {
              ...prev,
              rsvpStatus: data.status,
              rsvpRepresentative: data.representative,
              rsvpNote: data.note,
              rsvpAt,
            }
          : null
      );
      showToast(
        `Konfirmasi kehadiran "${simulatedInteractiveRecipient.recipientName}" tercatat.`
      );
    }
  };

  // Direct Guest Self-RSVP View when opened via QR Code URL (?rsvp=1...)
  if (urlRsvpPayload) {
    const matchedRecipient = events
      .find((e) => !urlRsvpPayload.eventId || e.id === urlRsvpPayload.eventId)
      ?.recipients.find(
        (r) =>
          r.invitationCode.toLowerCase() ===
          urlRsvpPayload.invitationCode.toLowerCase()
      );

    return (
      <MotionConfig reducedMotion="user">
        <GuestRsvpPage
          payload={urlRsvpPayload}
          initialStatus={matchedRecipient?.rsvpStatus}
          initialRepresentative={matchedRecipient?.rsvpRepresentative}
          initialNote={matchedRecipient?.rsvpNote}
          initialSubmittedAt={matchedRecipient?.rsvpAt}
          onSubmitRsvp={(data) =>
            handleRsvpSubmit(
              urlRsvpPayload.eventId,
              urlRsvpPayload.invitationCode,
              data
            )
          }
        />
      </MotionConfig>
    );
  }

  // In-App Simulation Mode for Interactive Gold Wax-Seal Video Invitation
  if (simulatedInteractiveRecipient) {
    return (
      <MotionConfig reducedMotion="user">
        <Suspense
          fallback={
            <div className="min-h-screen w-full bg-[#09090B] flex items-center justify-center text-[#FCE9B2] text-[13px] font-semibold">
              Memuat Undangan Video Interaktif...
            </div>
          }
        >
          <InteractiveInvitePage
            isSimulation
            config={interactiveConfig}
            payload={{
              eventId: activeEvent.id,
              invitationCode: simulatedInteractiveRecipient.invitationCode,
              salutation: simulatedInteractiveRecipient.salutation,
              recipientName: simulatedInteractiveRecipient.recipientName,
              institution: simulatedInteractiveRecipient.institution,
              eventName: metadata.eventName,
              date: metadata.date,
              time: metadata.time,
              location: metadata.location,
              organizer: metadata.organizer,
            }}
            initialStatus={simulatedInteractiveRecipient.rsvpStatus}
            initialRepresentative={
              simulatedInteractiveRecipient.rsvpRepresentative
            }
            initialNote={simulatedInteractiveRecipient.rsvpNote}
            initialSubmittedAt={simulatedInteractiveRecipient.rsvpAt}
            onBackToAdmin={() => setSimulatedInteractiveRecipient(null)}
            onSubmitRsvp={(data) =>
              handleRsvpSubmit(
                activeEvent.id,
                simulatedInteractiveRecipient.invitationCode,
                data
              )
            }
          />
        </Suspense>
      </MotionConfig>
    );
  }

  // In-App Simulation Mode when Admin tests a guest's QR RSVP page
  if (simulatedRsvpRecipient) {
    return (
      <MotionConfig reducedMotion="user">
        <GuestRsvpPage
          isSimulation
          payload={{
            eventId: activeEvent.id,
            invitationCode: simulatedRsvpRecipient.invitationCode,
            salutation: simulatedRsvpRecipient.salutation,
            recipientName: simulatedRsvpRecipient.recipientName,
            institution: simulatedRsvpRecipient.institution,
            eventName: metadata.eventName,
            date: metadata.date,
            time: metadata.time,
            location: metadata.location,
            organizer: metadata.organizer,
          }}
          initialStatus={simulatedRsvpRecipient.rsvpStatus}
          initialRepresentative={simulatedRsvpRecipient.rsvpRepresentative}
          initialNote={simulatedRsvpRecipient.rsvpNote}
          initialSubmittedAt={simulatedRsvpRecipient.rsvpAt}
          onBackToAdmin={() => setSimulatedRsvpRecipient(null)}
          onSubmitRsvp={(data) =>
            handleRsvpSubmit(
              activeEvent.id,
              simulatedRsvpRecipient.invitationCode,
              data
            )
          }
        />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="relative min-h-screen w-full p-0 sm:p-5 lg:p-6 flex justify-center overflow-x-hidden"
        style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
      >
        {/* Subtle decorative PinHome sky-line wave accents on the outer canvas */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          className="pointer-events-none fixed inset-0 w-full h-full opacity-55"
        >
          <path
            d="M-60 660 C 260 640, 420 520, 720 530 C 1020 540, 1240 440, 1520 260"
            fill="none"
            stroke="#B4E4F2"
            strokeWidth="2.5"
          />
          <path
            d="M-80 240 C 220 320, 520 190, 920 240 C 1180 270, 1340 210, 1520 170"
            fill="none"
            stroke="#C3ECF7"
            strokeWidth="2"
          />
        </svg>

        {/* PinHome Signature All-Around Turquoise-Teal Frame (full-bleed on phones) */}
        <div
          className="relative z-10 w-full max-w-[1440px] rounded-none sm:rounded-[32px] p-0 sm:p-2.5 lg:p-3 shadow-none sm:shadow-[0_24px_60px_-20px_rgba(31,155,150,0.38)] flex min-h-screen sm:min-h-[calc(100vh-3rem)]"
          style={{ backgroundColor: 'var(--bg-sidebar)' }}
        >
          {/* Left Vertical Sidebar */}
          <Sidebar
            activeTab={activeTab}
            activeEventName={metadata.eventName}
            stepStatus={stepStatus}
            onSelectTab={setActiveTab}
            onGenerateAll={handleStartBatchExport}
            readyCount={readyCount}
            totalCount={recipients.length}
            isGeneratingBatch={isGeneratingBatch}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          {/* Main White Content Workspace */}
          <main
            className="flex-1 min-w-0 rounded-none sm:rounded-[26px] flex flex-col overflow-hidden shadow-none sm:shadow-[0_8px_28px_-12px_rgba(27,27,75,0.14)]"
            style={{ backgroundColor: 'var(--bg-surface-main)' }}
          >
            {/* Contextual Top Header Bar (single-row compact on smartphones) */}
            <header className="flex items-center justify-between gap-2 sm:gap-4 px-3.5 sm:px-8 py-2.5 sm:py-4 border-b border-[#EDF5F8]">
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 rounded-full border border-[#DDEEF3] text-[#1B1B4B] hover:bg-[#EDF8FB]"
                  aria-label="Buka menu navigasi"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {activeTab === 'guests' || activeTab === 'export' ? (
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-[#1B1B4B]/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      aria-label="Cari nama penerima, instansi, atau kode undangan"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama penerima, instansi, atau kode..."
                      className="w-full pl-10 pr-9 py-2 rounded-full border border-transparent bg-[#F4FBFD] text-[13px] text-[#1B1B4B] placeholder:text-[#8E96AB] focus:bg-white focus:border-[#BCE6F2] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]/30 transition-all"
                    />
                    {!searchQuery && (
                      <span
                        aria-hidden="true"
                        className="hidden sm:inline-flex items-center justify-center pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#9AA3B8]"
                      >
                        /
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#E3F5FA] text-[#167F7B] text-[11px] font-bold whitespace-nowrap">
                      {activeTab === 'dashboard'
                        ? 'Beranda'
                        : activeTab === 'info'
                          ? 'Info & Template'
                          : activeTab === 'video'
                            ? 'Video 3D'
                            : 'Desain PDF'}
                    </span>
                    <span
                      title={metadata.eventName}
                      className="text-[13.5px] font-display font-bold text-[#1B1B4B] truncate"
                    >
                      {metadata.eventName}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                {cloudRsvpEnabled && adminEmail && (
                  <button
                    type="button"
                    disabled={workspaceSyncStatus === 'syncing'}
                    onClick={() => void runWorkspaceCloudSync({ manual: true })}
                    title={
                      workspaceSyncStatus === 'unsaved'
                        ? 'Ada perubahan acara belum tersimpan online — klik untuk simpan ke Cloud sekarang'
                        : workspaceSyncStatus === 'error'
                          ? 'Sinkronisasi Cloud gagal — klik untuk mencoba lagi'
                          : 'Semua acara tersinkron online antar-PC — klik untuk cek pembaruan terbaru'
                    }
                    aria-label="Sinkronisasi Acara Cloud"
                    className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                      workspaceSyncStatus === 'unsaved'
                        ? 'border-[#F3D34F] bg-[#FFFBEB] text-[#785A07] hover:bg-[#FEF3C7]'
                        : workspaceSyncStatus === 'error'
                          ? 'border-[#F5C6D2] bg-[#FFF5F7] text-[#B83B5E] hover:bg-[#FDE8EE]'
                          : 'border-[#DDEEF3] bg-[#F4FBFD] text-[#157A76] hover:bg-[#E3F5FA]'
                    }`}
                  >
                    {workspaceSyncStatus === 'syncing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : workspaceSyncStatus === 'unsaved' ? (
                      <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="hidden sm:inline">
                      {workspaceSyncStatus === 'syncing'
                        ? 'Menyimpan...'
                        : workspaceSyncStatus === 'unsaved'
                          ? 'Simpan Cloud'
                          : workspaceSyncStatus === 'error'
                            ? 'Coba Sinkron'
                            : 'Cloud ✓'}
                    </span>
                  </button>
                )}

                {cloudRsvpEnabled && (
                  <button
                    type="button"
                    disabled={isSyncingCloudRsvp}
                    onClick={() => void handleSyncCloudRsvp(false)}
                    title="Muat konfirmasi kehadiran terbaru dari tamu"
                    aria-label="Sinkron RSVP"
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full border border-[#B5E9E0] bg-[#DCF5F1]/75 text-[12px] font-semibold text-[#157A76] hover:bg-[#DCF5F1] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <IconBadge name="status-check" size="xs" />
                    <span className="hidden sm:inline">
                      {isSyncingCloudRsvp ? 'Memuat...' : 'Sinkron RSVP'}
                    </span>
                  </button>
                )}

                {adminEmail && onSignOut && (
                  <button
                    type="button"
                    onClick={() => void onSignOut()}
                    title={`Masuk sebagai ${adminEmail} · Klik untuk keluar`}
                    aria-label={`Keluar dari akun ${adminEmail}`}
                    className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full border border-[#F5C6D2] bg-[#FFF5F7] text-[12px] font-semibold text-[#B83B5E] hover:bg-[#FDE8EE] transition-colors whitespace-nowrap shrink-0"
                  >
                    <span className="hidden md:inline max-w-[150px] truncate">
                      {adminEmail}
                    </span>
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Keluar</span>
                  </button>
                )}
              </div>
            </header>

            {/* Dynamic Workspace Viewport with Smooth Tab Transition */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-7 py-3 sm:py-6">
              {activeTab !== 'dashboard' && (
                <WorkflowStepperBar
                  activeTab={activeTab}
                  activeEventName={metadata.eventName}
                  stepStatus={stepStatus}
                  recipientCount={recipients.length}
                  onSelectTab={setActiveTab}
                />
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-[13px] font-medium text-[#757E96]">
                        Memuat halaman...
                      </div>
                    }
                  >
                  {activeTab === 'dashboard' && (
                    <DashboardView
                      eventId={activeEvent.id}
                      metadata={metadata}
                      templates={templates}
                      overlays={overlays}
                      recipients={recipients}
                      interactiveConfig={interactiveConfig}
                      previewRecipientId={previewRecipientId}
                      onSelectPreviewRecipient={setPreviewRecipientId}
                      events={events}
                      activeEventId={activeEvent.id}
                      stepStatus={stepStatus}
                      onSelectEvent={handleSelectEvent}
                      onCreateEvent={handleCreateEvent}
                      onDuplicateEvent={handleDuplicateEvent}
                      onToggleEventCompleted={handleToggleEventCompleted}
                      onDeleteEvent={handleDeleteEvent}
                      onNavigate={setActiveTab}
                      onPreviewRecipient={handlePreviewRecipient}
                      onSimulateInteractiveInvite={setSimulatedInteractiveRecipient}
                      onNotify={showToast}
                    />
                  )}

                  {activeTab === 'info' && (
                    <EventInfoTemplateView
                      metadata={metadata}
                      onChangeMetadata={setMetadata}
                      templates={templates}
                      onChangeTemplates={setTemplates}
                      overlays={overlays}
                      onChangeOverlays={setOverlays}
                      onNavigate={setActiveTab}
                      onResetWorkspace={handleResetWorkspace}
                    />
                  )}

                  {activeTab === 'guests' && (
                    <GuestListView
                      eventId={activeEvent.id}
                      recipients={recipients}
                      filteredRecipients={filteredRecipients}
                      availableGroups={availableGroups}
                      groupFilter={groupFilter}
                      onSelectGroupFilter={setGroupFilter}
                      metadata={metadata}
                      onAddRecipient={handleAddRecipient}
                      onUpdateRecipient={handleUpdateRecipient}
                      onDeleteRecipient={handleDeleteRecipient}
                      onBulkDeleteByGroup={handleBulkDeleteByGroup}
                      onApplyPdfSelection={handleApplyPdfSelection}
                      onSyncBankUpdates={handleSyncBankUpdates}
                      onNotify={showToast}
                      onBulkImport={handleBulkImport}
                      onPreviewRecipient={handlePreviewRecipient}
                      onDownloadSinglePdf={handleDownloadSinglePdf}
                      onSimulateRsvp={setSimulatedRsvpRecipient}
                      onSimulateInteractiveInvite={setSimulatedInteractiveRecipient}
                      interactiveConfig={interactiveConfig}
                      whatsappTemplate={interactiveConfig.whatsappTemplate}
                      downloadingId={downloadingId}
                      searchQuery={searchQuery}
                      onNavigate={setActiveTab}
                    />
                  )}

                  {(activeTab === 'layout' || activeTab === 'video') && (
                    <LayoutEditorView
                      activeMode={activeTab === 'video' ? 'video' : 'pdf'}
                      eventId={activeEvent.id}
                      metadata={metadata}
                      templates={templates}
                      overlays={overlays}
                      onChangeOverlays={setOverlays}
                      interactiveConfig={interactiveConfig}
                      onChangeInteractiveConfig={setInteractiveConfig}
                      recipients={recipients}
                      previewRecipientId={previewRecipientId}
                      onSelectPreviewRecipient={setPreviewRecipientId}
                      onResetOverlays={handleResetOverlays}
                      onSaveAsDefault={handleSaveAsDefaultSystem}
                      onClearCustomDefault={handleClearSystemDefault}
                      onCopyDefaultJson={handleCopySystemDefaultJson}
                      hasCustomDefault={Boolean(systemDefaultState)}
                      customDefaultSavedAt={systemDefaultState?.savedAt ?? null}
                      onOpenFullPreview={handlePreviewRecipient}
                      onOpenGuestLinks={() => {
                        setExportInitialSection('links');
                        setActiveTab('export');
                      }}
                      onNotify={showToast}
                      onNavigate={setActiveTab}
                    />
                  )}

                  {activeTab === 'export' && (
                    <BatchQueueView
                      eventId={activeEvent.id}
                      metadata={metadata}
                      templates={templates}
                      recipients={filteredRecipients}
                      allRecipients={recipients}
                      totalRecipientsCount={recipients.length}
                      availableGroups={availableGroups}
                      groupFilter={groupFilter}
                      onSelectGroupFilter={setGroupFilter}
                      isGeneratingBatch={isGeneratingBatch}
                      batchProcessedCount={batchProcessedCount}
                      batchTotalCount={batchTotalCount}
                      currentGeneratingName={currentGeneratingName}
                      hasReadyZip={hasReadyZip}
                      onStartBatchExport={handleStartBatchExport}
                      onDownloadZipArchive={handleDownloadZipArchive}
                      onDownloadSinglePdf={handleDownloadSinglePdf}
                      onPreviewRecipient={handlePreviewRecipient}
                      onSimulateInteractiveInvite={setSimulatedInteractiveRecipient}
                      interactiveConfig={interactiveConfig}
                      onChangeInteractiveConfig={setInteractiveConfig}
                      initialSection={exportInitialSection}
                      whatsappTemplate={interactiveConfig.whatsappTemplate}
                      onNotify={showToast}
                      stepStatus={stepStatus}
                      onNavigate={setActiveTab}
                      downloadingId={downloadingId}
                      searchQuery={searchQuery}
                    />
                  )}
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Floating Non-Shifting Toast Notification */}
        <FloatingToast toast={toast} onDismiss={() => setToast(null)} />

        {/* Instant Single-Recipient Full Preview Modal */}
        {modalRecipient && (
          <Suspense fallback={null}>
            <InvitationPreviewModal
              eventId={activeEvent.id}
              recipient={modalRecipient}
              recipients={recipients}
              initialPage={modalPreviewPage}
              metadata={metadata}
              templates={templates}
              overlays={overlays}
              onClose={() => setModalTarget(null)}
              onSelectRecipient={(r) => {
                setModalTarget({ recipientId: r.id, fallback: r });
                setPreviewRecipientId(r.id);
              }}
              onDownloadPdf={handleDownloadSinglePdf}
              onSimulateRsvp={setSimulatedRsvpRecipient}
            />
          </Suspense>
        )}
      </div>
    </MotionConfig>
  );
}
