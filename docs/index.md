# AgriSAT🌎 Platform

Welcome to AgriSAT!

AgriSAT is a geospatial intelligence platform for precision agriculture. Powered by Gemma 4, AgriSAT offers an end-to-end solution for farmers to monitor, diagnose, and manage their crops more effective and efficiently. Quickly detect problems with crop growth, plan for fertilizer and pesticide application based on weather patterns, and get an accurate agronomic consultation with Gemma 4 agent!

**Main features:**

**Precision agriculture assistant.** Powered by Gemma 4, AgriSAT offers a wide-knowledge of agronomic best practices for farmers. AgriSAT agent is equipped with tools to access rich environmental, weather, and satellite data along with a library of agronomic knowledge distilled from NotebookLM research. These resources give AgriSAT agent a superpower that enables AgriSAT to deliver an accurate recommendation based on real-world conditions.

**Crop monitoring system.** The Sentinel-2 Multi-Spectral Instrument (MSI) data enabled AgriSAT to derive an accurate environmental indices to measure vegetation, chlorophyll, and water stress in farmland across the globe. These indices helps farmers to detect drought, crop stress and diseases.

**Weather prediction.** Weather significantly dictates farmers when to plant crops and apply fertilizer and pesticides. Especially in rice paddy fields where rice require lots of water in the first half of their growing stages.

In this project, we focused our analysis at the Bogor, Jawa Barat, Indonesia region. Currently, providing a nationwide analyses is impossible due to the required storage and compute capabilities.

> See [Glossary](./glossary.md) if you don't understand some words in this documentation.

## Running this Project

First thing first, clone this repository into your local machine. Then, you would need to pick whether to use your own local LLM or use Google Gemini or other AI provider. I recommend using Llama.cpp or Ollama if you want a fully local AgriSAT experience, or use Google Gemini API to access Gemma 4 and other frontier models Google has to offer.

You can download the pre-built AgriSAT Geospatial Database before running the project locally. You can also run the data processing pipeline but it will take time and around 150 GB of storage. Therefore, we recommend you to download the pre-built dataset.

| Dataset                     | Last Updated | Download     |
|-----------------------------|--------------|--------------|
| AgriSAT Geospatial Database | 2026/05/16   | Google Drive |

### Using Docker

Docker is the most straightforward way to deploy AgriSAT locally. The included Docker Compose also contains the Ollama server to serve a local Gemma 4 E4B model.

1. Clone the repo
2. Download the AgriSAT Geospatial Database
3. Create environment files
4. Start the containers

Usually, you don't need to change the contents of the environment files. It is ready to use out-of-the-box.

```bash
# clone the repo
git clone https://github.com/fahminlb33/agrisat.git

# change directory to docker
cd docker

# download the AgriSAT Geospatial Database
# and store it here (data.db)

# copy 
cp agent.env.example agent.env
cp api.env.example api.env
cp web.env.example web.env

# start the containers
docker compose up
```

If everything goes smoothly, you can visit the app at [http://localhost:8000](http://localhost:8000).

### Using `uv` and `node`

TODO.

### Running the project end-to-end

TODO.

## Technical Details

AgriSAT is built upon a two integral components: (1) batch ETL data processing pipeline and (2) React & FastAPI GIS web app.

The data processing pipeline relies heavily on QGIS program to perform geographical modelling and GDAL toolkit to automate the raster data processing.

### Precision agriculture agent with ADK & Gemma 4

![AgriSAT agentic chat with Gemma 4](./agentic-chat.webp)

See the system prompt [here](./system-prompt.md).



### The science and ETL pipeline

Now we're entering the science part of AgriSAT. How AgriSAT processes the satellite data and produced the high quality data used for the AI agent to help farmers.

![AgriSAT data lineage](./data-sources.webp)

To learn more about the details of the data processing pipeline, you can check out the respective [Environmental Data Documentation](./environment.md) and [Weather Data Documentation](./weather.md).

## Acknowledgment

The author would like to thank:

- the [European Space Agency (ESA) Coprnicus Data Space Ecosystem (CDSE)](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2) for providing the most needed raster data to monitor vegetation indices,
- the [European Centre for Medium-Range Weather Forecasts (ECMWF)](https://www.ecmwf.int/en/forecasts/datasets/open-data) for providing the global weather forecast,
- the [Copernicus Climate Data Store (CDS)](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=download) for providing the ERA5-Land global hourly weather reanalysis data,
- the [United States Geological Survey (USGS)](https://earthexplorer.usgs.gov/) and [National Aeronautics and Space Administration (NASA)](https://www.earthdata.nasa.gov/data/instruments/srtm) for providing the digital elevation model (DEM),
- the [CelesTrak](https://celestrak.org/NORAD/elements/) for providing the NORAD GP Element Sets data to calculate satellite orbit,
- and the [United Nations OCHA Regional Office for Asia and the Pacific (ROAP)](https://data.humdata.org/dataset/cod-ab-idn) for providing the Indonesian subnational administrative boundaries polygon.
