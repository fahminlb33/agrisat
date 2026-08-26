import sqlite3

# ----------------------------------------------
# Shared
# ----------------------------------------------


def get_connection():
    return sqlite3.connect("../agrisat-api/data.db", check_same_thread=False)


# ----------------------------------------------
# Constants
# ----------------------------------------------

VEGETATION_INDICES_TABLE = {
    "Indeks Vegetasi": [
        "**Normalized Difference Vegetation Index (NDVI)**",
        "**Green Normalized Difference Vegetation Index (GNDVI)**",
        "**Wide Dynamic Range Vegetation Index (WDRVI)**",
        "**Modified Soil Adjusted Vegetation Index (MSAVI)**",
        "**Normalized Difference Red-Edge (NDRE)**",
        "**Chlorophyll Index Red Edge (CIRE)**",
        "**Normalized Difference Moisture Index (NDMI)**",
        "**Normalized Difference Water Index (NDWI)**",
    ],
    "Manfaat": [
        "Indeks Kesehatan Tanaman Umum",
        "Indeks Kesehatan Hijau",
        "Indeks Kesehatan Jangkauan Luas",
        "Indeks Koreksi Tanah",
        "Indeks Kesehatan Kanopi Dalam",
        "Indeks Klorofil/Nutrisi",
        "Indeks Kelembaban Tanaman",
        "Indeks Air Permukaan",
    ],
    "Deskripsi": [
        "Alat untuk mengukur kehijauan dan kepadatan daun guna memeriksa kesehatan tanaman secara umum serta mendeteksi stres lebih awal, meskipun bisa jenuh jika tanaman terlalu lebat",
        "Indeks ini berfokus pada klorofil daun untuk memantau penggunaan nitrogen dan air selama pertengahan hingga akhir musim, menjadikannya ideal untuk tanaman yang lebat",
        "Indeks kelas yang sangat sensitif dan akurat saat memantau lahan yang sangat tebal dan lebat pada tahap pertumbuhan akhir",
        'Alat untuk awal musim yang menyaring "gangguan" latar belakang tanah agar dapat memantau bibit yang baru tumbuh secara akurat saat lahan masih didominasi tanah terbuka',
        "Menggunakan cahaya khusus untuk menembus lapisan daun atas, sehingga mampu mendeteksi kekurangan nitrogen pada tanaman lebat yang sudah matang beberapa minggu sebelum daun menguning secara kasat mata",
        "Melacak tren kesehatan sepanjang musim dengan mengukur kandungan klorofil daun untuk mendeteksi kekurangan nutrisi atau stres kekeringan sejak dini",
        "Memantau kandungan air di dalam daun sepanjang musim untuk menemukan titik-titik kering dan mendeteksi stres kekurangan air sebelum tanaman layu",
        "Alat yang digunakan setelah hujan lebat untuk memetakan banjir permukaan, genangan air, atau untuk mengelola tingkat air di sawah padi",
    ],
}
