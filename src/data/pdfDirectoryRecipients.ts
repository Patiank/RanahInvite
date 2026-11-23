import { Recipient } from '../types';

export interface PdfDirectoryGroupMeta {
  id: string;
  name: string;
  sourcePages: string;
  description: string;
}

export const PDF_DIRECTORY_GROUPS: PdfDirectoryGroupMeta[] = [
  {
    id: 'opd-pemprov',
    name: 'OPD Pemprov Sumbar',
    sourcePages: 'Hal. 1–2',
    description: '50 pejabat OPD, Kepala Badan, Kepala Dinas, Direktur RSUD, & Kepala Biro Provinsi Sumatera Barat',
  },
  {
    id: 'opd-sijunjung',
    name: 'Forkopimda & OPD Kab. Sijunjung',
    sourcePages: 'Hal. 3',
    description: '36 pimpinan daerah, Forkopimda, OPD, serta Camat se-Kabupaten Sijunjung',
  },
  {
    id: 'bumn-kampus-asosiasi',
    name: 'BUMN/BUMD, Perguruan Tinggi & Asosiasi',
    sourcePages: 'Hal. 4',
    description: '9 pimpinan BI Sumbar, Bank Nagari, PHRI, HPI, serta 5 Rektor Perguruan Tinggi di Sumbar',
  },
  {
    id: 'dispar-kabkota',
    name: 'Dinas Pariwisata Kab/Kota se-Sumbar',
    sourcePages: 'Hal. 5',
    description: '19 Kepala Dinas Pariwisata Kabupaten dan Kota se-Sumatera Barat',
  },
  {
    id: 'dekranasda',
    name: 'Ketua Dekranasda Provinsi & Kab/Kota',
    sourcePages: 'Hal. 6',
    description: '20 Ketua Dekranasda tingkat Provinsi Sumatera Barat serta 19 Kabupaten/Kota',
  },
  {
    id: 'bumn-sumbar',
    name: 'BUMN / BUMD Sumatera Barat',
    sourcePages: 'Hal. 7',
    description: '7 pimpinan BUMN/BUMD strategis di Sumatera Barat',
  },
  {
    id: 'asosiasi-pariwisata',
    name: 'Asosiasi Pariwisata Sumatera Barat',
    sourcePages: 'Hal. 8',
    description: '6 Ketua Asosiasi Pariwisata (PHRI, HPI, GIPI, BPPD, ASITA, ASATI Sumbar)',
  },
  {
    id: 'dispar-dutawisata-indo',
    name: 'Dinas Pariwisata & Duta Wisata se-Indonesia',
    sourcePages: 'Hal. 9',
    description: '33 Dinas Pariwisata Provinsi se-Indonesia beserta Duta Wisata daerah masing-masing',
  },
  {
    id: 'dispar-provinsi-indo',
    name: 'Dinas Pariwisata Provinsi se-Indonesia',
    sourcePages: 'Hal. 10–14',
    description: '33 Dinas Pariwisata Provinsi se-Indonesia (daftar lampiran Uda Uni Duta Wisata)',
  },
  {
    id: 'forkopimda-sumbar-kabkota',
    name: 'Forkopimda Provinsi & 19 Kab/Kota se-Sumbar',
    sourcePages: 'Hal. 15–32',
    description: '121 pejabat Forkopimda Provinsi Sumatera Barat serta 12 Kabupaten dan 7 Kota se-Sumbar',
  },
  {
    id: 'forkopimda-tanahdatar',
    name: 'Forkopimda Provinsi & Kab. Tanah Datar',
    sourcePages: 'Hal. 33',
    description: '13 pejabat Forkopimda Provinsi Sumatera Barat dan Forkopimda Kabupaten Tanah Datar',
  },
];

interface SeedRow {
  recipientName: string;
  institution: string;
  group: string;
  codePrefix: string;
}

const OPD_PEMPROV_ITEMS: Array<{ name: string; inst?: string }> = [
  { name: 'Sekretaris DPRD', inst: 'DPRD Provinsi Sumatera Barat' },
  { name: 'Inspektur Provinsi Sumatera Barat', inst: 'Pemerintah Provinsi Sumatera Barat' },
  { name: 'Kepala Badan Kepegawaian Daerah' },
  { name: 'Kepala Badan Pengembangan Sumber Daya Manusia' },
  { name: 'Kepala Badan Penanggulangan Bencana Daerah' },
  { name: 'Kepala Badan Pendapatan Daerah' },
  { name: 'Kepala Badan Perencanaan Pembangunan Daerah' },
  { name: 'Kepala Badan Pengelolaan Keuangan Dan Aset Daerah' },
  { name: 'Kepala Badan Penelitian Dan Pengembangan' },
  { name: 'Kepala Badan Kesatuan Bangsa Dan Politik' },
  { name: 'Kepala Dinas Pendidikan' },
  { name: 'Kepala Dinas Kesehatan' },
  { name: 'Kepala Dinas Sosial' },
  { name: 'Kepala Dinas Tenaga Kerja Dan Transmigrasi' },
  { name: 'Kepala Dinas Lingkungan Hidup' },
  { name: 'Kepala Dinas Pemberdayaan Masyarakat Desa' },
  { name: 'Kepala Dinas Perhubungan' },
  { name: 'Kepala Dinas Koperasi UKM' },
  { name: 'Kepala Dinas Penanaman Modal Dan Pelayanan Terpadu Satu Pintu' },
  { name: 'Kepala Dinas Kebudayaan' },
  { name: 'Kepala Dinas Kelautan Dan Perikanan' },
  { name: 'Kepala Dinas Peternakan Dan Kesehatan Hewan' },
  { name: 'Kepala Dinas Kehutanan' },
  { name: 'Kepala Dinas Energi Dan Sumber Daya Mineral' },
  { name: 'Kepala Dinas Perindustrian Dan Perdagangan' },
  { name: 'Kepala Satuan Polisi Pamong Praja' },
  { name: 'Kepala Dinas Bina Marga, Cipta Karya Dan Tata Ruang' },
  { name: 'Kepala Dinas Perumahan Rakyat, Kawasan Permukiman Dan Pertanahan' },
  { name: 'Kepala Dinas Komunikasi, Informatika Dan Statistik' },
  { name: 'Kepala Dinas Kearsipan Dan Perpustakaan' },
  { name: 'Kepala Dinas Pemberdayaan Perempuan Dan Perlindungan Anak, Pengendalian Penduduk dan KB' },
  { name: 'Kepala Dinas Sumber Daya Air Dan Bina Konstruksi' },
  { name: 'Kepala Dinas Pangan' },
  { name: 'Kepala Dinas Kependudukan Dan Pencatatan Sipil' },
  { name: 'Kepala Dinas Pemuda Dan Olahraga' },
  { name: 'Kepala Dinas Pariwisata' },
  { name: 'Kepala Dinas Perkebunan, Tanaman Pangan Dan Hortikultura' },
  { name: 'Direktur RS Dr Achmad Mochtar Bukittinggi' },
  { name: 'Direktur RSUD Pariaman' },
  { name: 'Direktur RSUD M Natsir' },
  { name: 'Direktur RSJ HB Saanin Padang' },
  { name: 'Kepala Biro Pemerintahan Dan Otonomi Daerah' },
  { name: 'Kepala Biro Hukum' },
  { name: 'Kepala Biro Kesejahteraan Rakyat' },
  { name: 'Kepala Biro Perekonomian' },
  { name: 'Kepala Biro Pengadaan Barang Dan Jasa' },
  { name: 'Kepala Biro Administrasi Pembangunan' },
  { name: 'Kepala Biro Organisasi' },
  { name: 'Kepala Biro Umum' },
  { name: 'Kepala Biro Administrasi Pimpinan' },
];

const SIJUNJUNG_ITEMS: Array<{ name: string; inst: string }> = [
  { name: 'Bupati Sijunjung', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Wakil Bupati Sijunjung', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Ketua DPRD', inst: 'DPRD Kab. Sijunjung' },
  { name: 'Kepala Kepolisian Resor', inst: 'Polres Kab. Sijunjung' },
  { name: 'Kepala Kejaksaan Negeri', inst: 'Kejaksaan Negeri Kab. Sijunjung' },
  { name: 'Komandan Distrik Militer', inst: 'Kodim Kab. Sijunjung' },
  { name: 'Sekretaris Daerah', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Asisten Pemerintahan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Asisten Perekonomian dan Pembangunan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Asisten Administrasi Umum', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Sekretariat DPRD', inst: 'DPRD Kab. Sijunjung' },
  { name: 'Inspektur Daerah', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Kesehatan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pendidikan dan Kebudayaan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pekerjaan Umum dan Penataan Ruang', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Satuan Polisi Pamong Praja', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pemadam Kebakaran', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Sosial', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Kependudukan Dan Pencatatan Sipil', inst: 'Pemerintah Kab. Sijunjung' },
  {
    name: 'Kepala Dinas Pengendalian Penduduk dan KB, Pemberdayaan Perempuan dan Perlindungan Anak',
    inst: 'Pemerintah Kab. Sijunjung',
  },
  { name: 'Kepala Dinas Penanaman Modal Dan Pelayanan Terpadu Satu Pintu', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Perdagangan, Koperasi, Usaha Kecil dan Menengah', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Perindustrian dan Tenaga Kerja', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Komunikasi dan Informatika', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pemberdayaan Masyarakat dan Desa/Nagari', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Perhubungan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Lingkungan Hidup, Perumahan Rakyat dan Permukiman', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Tanaman Pangan, Hortikultura dan Perkebunan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Perikanan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Pangan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Dinas Perpustakaan dan Kearsipan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Badan Perencanaan, Penelitian dan Pengembangan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Badan Kepegawaian dan Pengembangan SDM', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Kepala Badan Keuangan', inst: 'Pemerintah Kab. Sijunjung' },
  { name: 'Camat se-Kab. Sijunjung', inst: 'Pemerintah Kab. Sijunjung' },
];

const BUMN_KAMPUS_ITEMS: Array<{ name: string; inst: string }> = [
  { name: 'Kepala Perwakilan Bank Indonesia', inst: 'Provinsi Sumatera Barat' },
  { name: 'Direktur Utama Bank Nagari', inst: 'PT Bank Pembangunan Daerah Sumatera Barat' },
  { name: 'Ketua PHRI', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua HPI', inst: 'Provinsi Sumatera Barat' },
  { name: 'Rektor UMSB', inst: 'Universitas Muhammadiyah Sumatera Barat' },
  { name: 'Rektor UNP', inst: 'Universitas Negeri Padang' },
  { name: 'Rektor UNAND', inst: 'Universitas Andalas' },
  { name: 'Rektor Univ. Bung Hatta', inst: 'Universitas Bung Hatta' },
  { name: 'Rektor UPI', inst: 'Universitas Putra Indonesia YPTK Padang' },
];

const DISPAR_KABKOTA_ITEMS: Array<{ name: string; inst: string }> = [
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Agam' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Dharmasraya' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Kepulauan Mentawai' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Lima Puluh Kota' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Padang Pariaman' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Pasaman' },
  { name: 'Kepala Dinas Pariwisata', inst: 'Kab. Pasaman Barat' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Pesisir Selatan' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Sijunjung' },
  { name: 'Kepala Dinas Pariwisata dan Kebudayaan', inst: 'Kab. Solok' },
  { name: 'Kepala Dinas Pariwisata dan Kebudayaan', inst: 'Kab. Solok Selatan' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kab. Tanah Datar' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kota Bukittinggi' },
  { name: 'Kepala Dinas Pariwisata dan Kebudayaan', inst: 'Kota Padang' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kota Padang Panjang' },
  { name: 'Kepala Dinas Pariwisata dan Kebudayaan', inst: 'Kota Pariaman' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kota Payakumbuh' },
  { name: 'Kepala Dinas Pariwisata Pemuda dan Olahraga', inst: 'Kota Sawahlunto' },
  { name: 'Kepala Dinas Pariwisata', inst: 'Kota Solok' },
];

const SUMBAR_REGIONS = [
  'Kab. Agam',
  'Kab. Dharmasraya',
  'Kab. Kepulauan Mentawai',
  'Kab. Lima Puluh Kota',
  'Kab. Padang Pariaman',
  'Kab. Pasaman',
  'Kab. Pasaman Barat',
  'Kab. Pesisir Selatan',
  'Kab. Sijunjung',
  'Kab. Solok',
  'Kab. Solok Selatan',
  'Kab. Tanah Datar',
  'Kota Bukittinggi',
  'Kota Padang',
  'Kota Padang Panjang',
  'Kota Pariaman',
  'Kota Payakumbuh',
  'Kota Sawahlunto',
  'Kota Solok',
];

const DEKRANASDA_REGIONS = ['Provinsi Sumatera Barat', ...SUMBAR_REGIONS];

const BUMN_SUMBAR_ITEMS: Array<{ name: string; inst: string }> = [
  { name: 'Direktur Utama', inst: 'PT. Bank Pembangunan Daerah Sumatera Barat' },
  { name: 'Pimpinan', inst: 'PT. Jasa Raharja Sumatera Barat' },
  { name: 'Pimpinan', inst: 'PT. TASPEN Sumatera Barat' },
  { name: 'Pimpinan', inst: 'PT. Bukit Asam' },
  { name: 'Pimpinan', inst: 'LPP RRI Padang' },
  { name: 'Pimpinan', inst: 'BULOG Sumbar' },
  { name: 'Pimpinan', inst: 'PT. Kimia Farma Persero TBK' },
];

const ASOSIASI_PARIWISATA_ITEMS: Array<{ name: string; inst: string }> = [
  { name: 'Ketua PHRI', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua HPI', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua GIPI', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua BPPD', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua ASITA', inst: 'Provinsi Sumatera Barat' },
  { name: 'Ketua ASATI', inst: 'Provinsi Sumatera Barat' },
];

const DISPAR_DUTA_WISATA_ITEMS: Array<{ ambassador: string; province: string }> = [
  { ambassador: 'Dinas Pariwisata beserta Agam dan Inong', province: 'Provinsi Aceh' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Dara', province: 'Provinsi Riau' },
  { ambassador: 'Dinas Pariwisata beserta Jaka dan Dara', province: 'Provinsi Sumatera Utara' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Gadis Jambi', province: 'Provinsi Jambi' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Gadis Sriwijaya', province: 'Provinsi Sumatera Selatan' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Dayang', province: 'Provinsi Kep. Bangka Belitung' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Gadis', province: 'Provinsi Bengkulu' },
  { ambassador: 'Dinas Pariwisata beserta Teruna dan Dara', province: 'Provinsi Kepulauan Riau' },
  { ambassador: 'Dinas Pariwisata beserta Muli dan Mekhanai', province: 'Provinsi Lampung' },
  { ambassador: 'Dinas Pariwisata beserta Kang dan Nong Banten', province: 'Provinsi Banten' },
  { ambassador: 'Dinas Pariwisata beserta Abang dan None', province: 'Provinsi DKI Jakarta' },
  { ambassador: 'Dinas Pariwisata beserta Mojang dan Jajaka', province: 'Provinsi Jawa Barat' },
  { ambassador: 'Dinas Pariwisata beserta Mas dan Mbak', province: 'Provinsi Jawa Tengah' },
  { ambassador: 'Dinas Pariwisata beserta Dimas dan Diajeng', province: 'Provinsi DI Yogyakarta' },
  { ambassador: 'Dinas Pariwisata beserta Raka dan Raki', province: 'Provinsi Jawa Timur' },
  { ambassador: 'Dinas Pariwisata beserta Teruna Teruni Bali', province: 'Provinsi Bali' },
  { ambassador: 'Dinas Pariwisata beserta Terune dan Dedare Wisata NTB', province: 'Provinsi Nusa Tenggara Barat' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata', province: 'Provinsi Nusa Tenggara Timur' },
  { ambassador: 'Dinas Pariwisata beserta Jagau dan Bawi Nyai', province: 'Provinsi Kalimantan Tengah' },
  { ambassador: 'Dinas Pariwisata beserta Nanang dan Galuh', province: 'Provinsi Kalimantan Selatan' },
  { ambassador: 'Dinas Pariwisata beserta Bujang dan Dare', province: 'Provinsi Kalimantan Barat' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata Mahakam', province: 'Provinsi Kalimantan Timur' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata', province: 'Provinsi Kalimantan Utara' },
  { ambassador: 'Dinas Pariwisata beserta Kaka dan Kandi', province: 'Provinsi Sulawesi Barat' },
  { ambassador: 'Dinas Pariwisata beserta Anandonia dan Luale', province: 'Provinsi Sulawesi Tenggara' },
  { ambassador: 'Dinas Pariwisata beserta Nyong Noni Sulut', province: 'Provinsi Sulawesi Utara' },
  { ambassador: 'Dinas Pariwisata beserta Uti dan Nou', province: 'Provinsi Gorontalo' },
  { ambassador: 'Dinas Pariwisata beserta Randa ante Kabilasa', province: 'Provinsi Sulawesi Tengah' },
  { ambassador: 'Dinas Pariwisata beserta Dara Daeng', province: 'Provinsi Sulawesi Selatan' },
  { ambassador: 'Dinas Pariwisata beserta Jojaru - Ngongare', province: 'Provinsi Maluku Utara' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata', province: 'Provinsi Maluku' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata', province: 'Provinsi Papua' },
  { ambassador: 'Dinas Pariwisata beserta Putra Putri Duta Wisata', province: 'Provinsi Papua Barat' },
];

const FORKOPIMDA_PROV_SUMBAR: Array<{ name: string; inst: string }> = [
  { name: 'Gubernur Sumatera Barat', inst: 'Pemerintah Provinsi Sumatera Barat' },
  { name: 'Wakil Gubernur Sumatera Barat', inst: 'Pemerintah Provinsi Sumatera Barat' },
  { name: 'Sekretaris Daerah Provinsi Sumatera Barat', inst: 'Pemerintah Provinsi Sumatera Barat' },
  { name: 'Ketua DPRD Provinsi Sumatera Barat', inst: 'DPRD Provinsi Sumatera Barat' },
  { name: 'Kepala Kepolisian Daerah Sumatera Barat', inst: 'Polda Provinsi Sumatera Barat' },
  { name: 'Kepala Kejaksaan Tinggi Sumatera Barat', inst: 'Kejaksaan Tinggi Provinsi Sumatera Barat' },
  { name: 'Panglima Komando Daerah Militer', inst: 'Kodam I/Bukit Barisan' },
];

function buildForkopimdaRegionEntries(region: string): Array<{ name: string; inst: string }> {
  const isCity = region.startsWith('Kota ');
  const cleanName = region.replace(/^(Kab\.|Kota)\s+/i, '');

  if (region === 'Kota Padang') {
    return [
      { name: 'Walikota Padang', inst: 'Pemerintah Kota Padang' },
      { name: 'Wakil Walikota Padang', inst: 'Pemerintah Kota Padang' },
      { name: 'Ketua DPRD', inst: 'DPRD Kota Padang' },
      { name: 'Kepala Kepolisian Resor Kota Besar', inst: 'Polresta Kota Padang' },
      { name: 'Kepala Kejaksaan Negeri', inst: 'Kejaksaan Negeri Kota Padang' },
      { name: 'Komandan Resor Militer', inst: 'Korem Kota Padang' },
    ];
  }

  const headTitle = isCity ? `Walikota ${cleanName}` : `Bupati ${cleanName}`;
  const deputyTitle = isCity ? `Wakil Walikota ${cleanName}` : `Wakil Bupati ${cleanName}`;

  return [
    { name: headTitle, inst: `Pemerintah ${region}` },
    { name: deputyTitle, inst: `Pemerintah ${region}` },
    { name: 'Ketua DPRD', inst: `DPRD ${region}` },
    { name: 'Kepala Kepolisian Resor', inst: `Polres ${region}` },
    { name: 'Kepala Kejaksaan Negeri', inst: `Kejaksaan Negeri ${region}` },
    { name: 'Komandan Distrik Militer', inst: `Kodim ${region}` },
  ];
}

export function buildPdfDirectoryRecipients(): Recipient[] {
  const seeds: SeedRow[] = [];

  // 1. OPD Pemprov Sumbar (Hal. 1-2)
  for (const item of OPD_PEMPROV_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst ?? 'Pemerintah Provinsi Sumatera Barat',
      group: 'OPD Pemprov Sumbar',
      codePrefix: 'OPD',
    });
  }

  // 2. Forkopimda & OPD Kab. Sijunjung (Hal. 3)
  for (const item of SIJUNJUNG_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Forkopimda & OPD Kab. Sijunjung',
      codePrefix: 'SJJ',
    });
  }

  // 3. BUMN/BUMD, Perguruan Tinggi & Asosiasi (Hal. 4)
  for (const item of BUMN_KAMPUS_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'BUMN/BUMD, Perguruan Tinggi & Asosiasi',
      codePrefix: 'PTN',
    });
  }

  // 4. Dinas Pariwisata Kab/Kota se-Sumbar (Hal. 5)
  for (const item of DISPAR_KABKOTA_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Dinas Pariwisata Kab/Kota se-Sumbar',
      codePrefix: 'DPK',
    });
  }

  // 5. Ketua Dekranasda Provinsi & Kab/Kota (Hal. 6)
  for (const region of DEKRANASDA_REGIONS) {
    seeds.push({
      recipientName: 'Ketua Dekranasda',
      institution: region,
      group: 'Ketua Dekranasda Provinsi & Kab/Kota',
      codePrefix: 'DKR',
    });
  }

  // 6. BUMN / BUMD Sumatera Barat (Hal. 7)
  for (const item of BUMN_SUMBAR_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'BUMN / BUMD Sumatera Barat',
      codePrefix: 'BMN',
    });
  }

  // 7. Asosiasi Pariwisata Sumatera Barat (Hal. 8)
  for (const item of ASOSIASI_PARIWISATA_ITEMS) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Asosiasi Pariwisata Sumatera Barat',
      codePrefix: 'ASP',
    });
  }

  // 8. Dinas Pariwisata & Duta Wisata se-Indonesia (Hal. 9)
  for (const item of DISPAR_DUTA_WISATA_ITEMS) {
    seeds.push({
      recipientName: item.ambassador,
      institution: item.province,
      group: 'Dinas Pariwisata & Duta Wisata se-Indonesia',
      codePrefix: 'DWI',
    });
  }

  // 9. Dinas Pariwisata Provinsi se-Indonesia (Hal. 10-14)
  for (const item of DISPAR_DUTA_WISATA_ITEMS) {
    seeds.push({
      recipientName: 'Kepala Dinas Pariwisata',
      institution: item.province,
      group: 'Dinas Pariwisata Provinsi se-Indonesia',
      codePrefix: 'DPI',
    });
  }

  // 10. Forkopimda Provinsi & 19 Kab/Kota se-Sumbar (Hal. 15-32)
  for (const item of FORKOPIMDA_PROV_SUMBAR) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Forkopimda Provinsi & 19 Kab/Kota se-Sumbar',
      codePrefix: 'FKP',
    });
  }
  for (const region of SUMBAR_REGIONS) {
    for (const item of buildForkopimdaRegionEntries(region)) {
      seeds.push({
        recipientName: item.name,
        institution: item.inst,
        group: 'Forkopimda Provinsi & 19 Kab/Kota se-Sumbar',
        codePrefix: 'FKP',
      });
    }
  }

  // 11. Forkopimda Provinsi & Kab. Tanah Datar (Hal. 33)
  for (const item of FORKOPIMDA_PROV_SUMBAR) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Forkopimda Provinsi & Kab. Tanah Datar',
      codePrefix: 'FTD',
    });
  }
  for (const item of buildForkopimdaRegionEntries('Kab. Tanah Datar')) {
    seeds.push({
      recipientName: item.name,
      institution: item.inst,
      group: 'Forkopimda Provinsi & Kab. Tanah Datar',
      codePrefix: 'FTD',
    });
  }

  return seeds.map((row, idx) => ({
    id: `pdf-rec-${idx + 1}`,
    salutation: 'Kepada Yth.',
    recipientName: row.recipientName,
    institution: row.institution,
    placeLabel: 'di tempat',
    group: row.group,
    invitationCode: `${row.codePrefix}-${String(idx + 1).padStart(3, '0')}`,
    status: 'ready' as const,
  }));
}
