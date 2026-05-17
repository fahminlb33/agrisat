# Environmental Data

In this section we will discuss the detailed procedure of raster data processing to derive the environmental variable data. Our journey starts with the collection of Sentinel-2 raster data. This is the main ingredient of AgriSAT system. We specifically used the [Sentinel-2 MSI Level-2A BOA Reflectance](https://sentinels.copernicus.eu/web/sentinel/sentinel-data-access/sentinel-products/sentinel-2-data-products/collection-1-level-2a) dataset provided by the European Space Agency. The Sentinel-2 L2A dataset has been processed to remove atmospheric scattering and absorption, therefore it simplifies our data analysis pipeline.

Next, we derive various environmental indices specifically for crop monitoring. We focused on three broad categories of crop monitoring: (1) vegetation index, (2) chlorophyll index, and (3) water stress index. These three indices is important to deliver an accurate and effective data-driven decision making for precision agriculture. Combined with the power of Gemma 4, farmers can get a data grounded recommendation to better manage their crops.

## Input Data

The Sentinel-2 L2A product contains a total of 13 spectral bands spanning the visible, near-infrared (NIR), and shortwave infrared (SWIR) spectrums. Its wavelengths range from 43 nm to 2190 nm, with spatial resolutions of 10 m, 20 m, and 60 m depending on the band.

AgriSAT utilizes a subset of the available Sentinel-2 bands to derive the proposed crop monitoring indices as shown in the table below.

| Band Name | Description                         | Resolution |
|-----------|-------------------------------------|------------|
| B02       | Blue (492.4 nm)                     | 10m        |
| B03       | Green (559.8 nm)                    | 10m        |
| B04       | Red (663.6 nm)                      | 10m        |
| B05       | Vegetation red edge, RE1 (704.5 nm) | 20m        |
| B06       | Vegetation red edge, RE2 (740.5 nm) | 20m        |
| B07       | Vegetation red edge, RE3 (782.8 nm) | 20m        |
| B08       | NIR (832.8 nm)                      | 10m        |
| B11       | SWIR1 (1613.7 nm)                   | 20m        |
| B12       | SWIR2 (2202.4.7 nm)                 | 20m        |
| SCL       | Scene classification data           | 20m        |

Source: [SentinelHub](https://docs.sentinel-hub.com/api/latest/data/sentinel-2-l2a/)

The `SCL` band is derived using the Sen2Cor processor and it is used for quality control, mainly for cloud masking. Possible `SCL` values:

- 0 - No data
- 1 - Saturated / Defective
- 2 - Dark Area Pixels
- 3 - Cloud Shadows
- 4 - Vegetation
- 5 - Bare Soils
- 6 - Water
- 7 - Clouds low probability / Unclassified
- 8 - Clouds medium probability
- 9 - Clouds high probability
- 10 - Cirrus
- 11 - Snow / Ice

## Derived Variables

AgriSAT are interested in deriving these indices:

1. Vegetation index
   - Normalized Difference Vegetation Index (NDVI)
   - Green Normalized Difference Vegetation Index (GNDVI)
   - Wide Dynamic Range Vegetation Index (WDRVI)
   - Modified Soil Adjusted Vegetation Index (MSAVI)
2. Chlorophyll index
   - Normalized Difference Red-Edge (NDRE)
   - Chlorophyll Index Red Edge (CIRE)
3. Water stress index
   - Normalized Difference Moisture Index (NDMI)
   - Normalized Difference Water Index (NDWI)

We also derived the true color raster by combining the Red, Green, and Blue bands. This will give the farmers a good look from above to visually inspect their crops.

## Raster Calculator

Next, we can use GDAL raster calculator to derive the indices above. The formula used to derive those indices are as follows:

| Indices | Formula                                                            |
|---------|--------------------------------------------------------------------|
| NDVI    | $\frac{NIR - Red}{NIR + Red}$                                      |
| GNDVI   | $\frac{NIR - Green}{NIR + Green}$                                  |
| WDRVI   | $\frac{\alpha * NIR - Red}{\alpha * NIR + Red}, \alpha=0.1$        |
| MSAVI   | $\frac{2 * NIR + 1 - \sqrt{(2 * NIR + 1)^2 - 8 * (NIR - Red)}}{2}$ |
| CIRE    | $\frac{RE_3}{RE_1} - 1$                                            |
| NDRE    | $\frac{NIR - RE_2}{NIR + RE_2}$                                    |
| NDMI    | $\frac{NIR - SWIR1}{NIR + SWIR1}$                                  |
| NDWI    | $\frac{Green - NIR}{Green + NIR}$                                  |

Source: [Geopera](https://docs.geopera.com/spectral-indices/applications/crop-monitoring).

We then apply a cloud mask using the data from the `SCL` band. `SCL` pixels with value of 0, 3, 8, 9, and 10 will be excluded from calculation and marked as NoData to prevent skewing the zonal statistics.

The final formula with cloud masking is as follows:

$$
(Formula) * (SCL!=0)*(SCL!=3)*(SCL!=8)*(SCL!=9)*(SCL!=10)
$$

Using GDAL pipeline, we can then derive the environmental variable raster from the raw Sentinel-2 spectral bands raster data.

```bash
gdal pipeline \
    calc <rasters path> --calc <formula> --nodata 0 ! \
    clip --like <vector mask path> ! \
    set-type --datatype Float32 ! \
    write <output path> --overwrite --co PREDICTOR=2 --co COMPRESS=DEFLATE
```

When deriving the raster data, we used the whole Bogor polygon.

## Zonal Statistics

Finally, we performed the zonal statistics to get each zone/area measurements. We used four different vector mask for this task: (1) the whole Bogor area, (2) Bogor Kota and Kabupaten, (3) Bogor administrative area level 2 (kecamatan), and (4) digitized rice paddy fields from Google Earth.

```bash
gdal pipeline \
    read <raster path> ! \
    zonal-stats --band 1 --zones [ read <vector mask> ] --stat count,min,max,sum,mean,stdev --pixel fractional ! \
    write --output-format CSV --output /vsistdout/
```

The resulting CSV has the same order as the features in the vector mask. We collect the zonal statistics from the standard output and insert it into AgriSAT Spatial Database.

## References

Copernicus Sentinel-2 (processed by ESA), 2021, MSI Level-2A BOA Reflectance Product. Collection 1. European Space Agency. https://doi.org/10.5270/S2_-znk9xsj
