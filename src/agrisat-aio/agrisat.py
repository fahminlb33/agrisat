import datetime
import re

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from agrisat_api import (
    load_levels,
    load_map_time_indices,
    load_vegetation_time_series,
    load_weather_time_indices,
    load_weather_time_series,
    load_zones,
    render_map,
)
from plotly.subplots import make_subplots
from shared_data import VEGETATION_INDICES_TABLE

# ----------------------------------------------
# Config
# ----------------------------------------------

st.set_page_config(layout="wide")

st.title("AgriSAT Precision Agriculture🌱")
st.markdown(
    """
Selamat datang pada AgriSAT Precision Agriculture!

AgriSAT merupakan platform pertanian presisi cerdas yang menggunakan data penginderaan jarak jauh untuk menyediakan *insight* bagi petani. Terdapat dua komponen utama dalam sistem AgriSAT:

1. Peta *Variable Application Rate (VRA)*
2. Informasi Riwayat dan Prediksi Cuaca

Kedua informasi ini merupakan bagian dari sistem penunjang keputusan untuk mendukung kegiatan pertanian. Tujuan utama dari AgriSAT adalah menjadi sistem pendukung keputusan agar petani dapat merencanakan dan melaksanakan pertanian dengan efektif dan efisien.
"""
)

# ----------------------------------------------
# Sidebar
# ----------------------------------------------

with st.sidebar:
    level = st.selectbox("Level", load_levels()).lower()
    zone_val = st.selectbox("Zona", load_zones(level))
    zone_id = re.search(r"\((\d+)\)", zone_val).group(1).lower()

    st.subheader("Pengaturan Peta")

    date_sel = st.selectbox("Tanggal", load_map_time_indices())
    vegetation_index_val = st.selectbox(
        "Indeks Vegetasi",
        [
            "Normalized Difference Vegetation Index (NDVI)",
            "Green Normalized Difference Vegetation Index (GNDVI)",
            "Wide Dynamic Range Vegetation Index (WDRVI)",
            "Modified Soil Adjusted Vegetation Index (MSAVI)",
            "Normalized Difference Red-Edge (NDRE)",
            "Chlorophyll Index Red Edge (CIRE)",
            "Normalized Difference Moisture Index (NDMI)",
            "Normalized Difference Water Index (NDWI)",
        ],
    )

    vegetation_show = st.checkbox("Tampilkan Peta Vegetasi")
    vegetation_index = re.search(r"\((\w+)\)", vegetation_index_val).group(1).lower()

    st.subheader("Pengaturan Cuaca")

    weather_date_data = load_weather_time_indices()
    weather_date_sel = st.date_input(
        "Tanggal",
        (weather_date_data[1] - datetime.timedelta(days=6), weather_date_data[1]),
        weather_date_data[0],
        weather_date_data[1],
        format="YYYY.MM.DD",
    )


# ----------------------------------------------
# Map
# ----------------------------------------------

st.header("Peta *Variable Application Rate (VRA)* 🗺️")
st.markdown("""
Peta *Variable Application Rate (VRA)* merupakan peta yang bertujuan untuk menampilkan wilayah pertanian yang membutuhkan perhatian, misalnya untuk pengaplikasian pupuk, irigasi air, maupun pestisida. Peta VRA dibuat menggunakan data raster atau data citra satelit yang diolah untuk menunjukkan kondisi permukaan bumi yang disebut juga sebagai indeks vegetasi.

Anda bisa klik pada sidebar kiri untuk memilih lokasi, tanggal, hingga jenis indeks vegetasi yang akan ditampilkan. Visualisasi peta dan tabel di bawah ini menunjukkan data vegetasi untuk kurun waktu satu hari.
""")


with st.expander("Apa pengertian indeks vegetasi?"):
    st.table(VEGETATION_INDICES_TABLE)

map_df, map_image, map_image_bounds, map_center = render_map(
    date_sel, level.lower(), vegetation_index
)

map_fig = px.choropleth_map(
    map_df,
    geojson=map_df.geometry,
    locations=map_df.index,
    color=vegetation_index,
    color_continuous_scale="Viridis",
    # range_color=(0, 12),
    map_style="carto-positron",
    zoom=8,
    center=map_center,
    opacity=0.5,
    labels={"name": "Wilayah"},
    hover_name="name",
    hover_data={
        "name": True,
        "ndvi": ":.4f",
        "gndvi": ":.4f",
        "wdrvi": ":.4f",
        "msavi": ":.4f",
        "ndre": ":.4f",
        "cire": ":.4f",
        "ndmi": ":.4f",
        "ndwi": ":.4f",
    },
)

map_fig.update_layout(margin={"r": 0, "t": 0, "l": 0, "b": 0})

if vegetation_show:
    map_fig.update_layout(
        map_layers=[
            {
                "sourcetype": "image",
                "source": map_image,
                "coordinates": map_image_bounds,
            }
        ],
    )

st.plotly_chart(map_fig)
st.dataframe(map_df.drop(columns=["area", "geometry"]), height=200)

st.text("")
st.markdown(
    """
Selain data indeks vegetasi harian, Anda bisa melihat perubahan tren indeks vegetasi selama sepanjang tahun pada grafik di bawah ini.
"""
)

vegetation_ts_df = load_vegetation_time_series(zone_id)
vegetation_fig = px.line(
    vegetation_ts_df,
    x="timestamp",
    y=vegetation_index,
    markers=True,
    title=f"Riwayat Data: {vegetation_index_val}",
)
st.plotly_chart(vegetation_fig)

st.markdown(
    """
Peta VRA menampikan informasi satu waktu (*snapshot*) mengenai kondisi kesehatan tanaman yang dapat digunakan sebagai dasar untuk memilih waktu dan metode distribusi pupuk, pestisida, dan air. Selain itu, grafik tren perubahan indeks vegetasi dapat digunakan oleh petani untuk memantau pertumbuhan tanamannya dari jauh.
"""
)


# ----------------------------------------------
# Weather
# ----------------------------------------------

st.header("Informasi Cuaca 🌥️")
st.markdown(
    """
Cuaca merupakan komponen vital dalam kesuksesan pertanian. Maka dari itu, AgriSAT menyediakan akses ke data riwayat dan prediksi cuaca agar petani dapat merencanakan pertanian dengan baik. Salah satu contohnya adalah untuk menghindari waktu yang kurang optimal dalam memberikan pupuk (sebaiknya tidak hujan setelah dilakukan pemupukan).
"""
)

data = load_weather_time_series(zone_id, weather_date_sel[0], weather_date_sel[1])

fig = make_subplots(
    rows=2,
    cols=2,
    shared_xaxes="all",  # This links the zoom/pan zoom of both x-axes
    vertical_spacing=0.05,  # Keeps the plots tightly integrated
)

fig.add_trace(
    go.Scatter(
        x=data["timestamp"],
        y=data["temperature"],
        name="Suhu Udara (°C)",
        mode="lines+markers",
    ),
    row=1,
    col=1,
)

fig.add_trace(
    go.Scatter(
        x=data["timestamp"],
        y=data["precipitation"],
        name="Curah Hujan (kg/m^2)",
        mode="lines+markers",
    ),
    row=1,
    col=2,
)

fig.add_trace(
    go.Scatter(
        x=data["timestamp"],
        y=data["cloud_cover_pct"],
        name="Tutupan Awan (%)",
        mode="lines+markers",
    ),
    row=2,
    col=1,
)

fig.add_trace(
    go.Scatter(
        x=data["timestamp"], y=data["is_raining"], name="Hujan?", mode="lines+markers"
    ),
    row=2,
    col=2,
)

fig.update_yaxes(title_text="Suhu Udara (°C)", row=1, col=1)
fig.update_yaxes(title_text="Curah Hujan (kg/m^2)", row=1, col=2)
fig.update_yaxes(title_text="Tutupan Awan (%)", row=2, col=1)
fig.update_yaxes(title_text="Hujan?", row=2, col=2)

fig.update_layout(
    height=400,
    showlegend=True,
    margin={"r": 0, "t": 0, "l": 0, "b": 0},
    legend={
        "x": 0.5,
        "y": -0.15,
        "xanchor": "center",
        "yanchor": "top",
        "orientation": "h",
    },
)

st.plotly_chart(fig)
st.dataframe(data, height=200)
