# Weather Data

In this section we discuss the collection of weather data to support the analysis from environmental data. Weather is also an integral part of agriculture especially paddy because it dictates when is the best time to sow, fertilize, apply pesticides and harvest. Fertilizer and pesticide application depends heavily on rain pattern. Farmers must avoid applying both of them when there is a risk of rain because it will be washed away downstream.

Unlike the processing pipeline for the environmental data, the weather data pipeline is much more straightforward. We collect the data and went straight into sampling the raster with our mask vector. No raster calculation needed.

## Input Data

Unlike the environmental data, the weather data requires two different datasets. While both are produced by the [European Centre for Medium-Range Weather Forecasts (ECMWF)](https://www.ecmwf.int/), the dataset differs in their temporal extent. The first dataset, the [ERA5 hourly data](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) provides historical weather data reanalysis. The second dataset, the [ECMWF IFS High-resolution forecast](https://www.ecmwf.int/en/forecasts/datasets/open-data) provides 7 days weather forecast.

It is also important to mention that the ERA5 dataset is lagging with 6-7 days delay from the current date. The ECMWF forecast however only lags for one day and provides the same 7 days forecast horizon. Therefore, it is possible that AgriSAT might have missing weather data points between those lagging days.

The variables used from both dataset:

| Variable                                                            | Unit              | Description                                                                                      |
|---------------------------------------------------------------------|-------------------|--------------------------------------------------------------------------------------------------|
| [2m temperature](https://codes.ecmwf.int/grib/param-db/167)         | &deg;C            | This parameter is the temperature of air at 2m above the surface of land, sea or in-land waters. |
| [Total precipitation](https://codes.ecmwf.int/grib/param-db/228228) | kg m<sup>-2</sup> |                                                                                                  |
| [Total cloud cover](https://codes.ecmwf.int/grib/param-db/500046)   | %                 |                                                                                                  |
| [Precipitation type](https://codes.ecmwf.int/grib/param-db/260015)  | unitless          | This parameter describes the type of precipitation at the surface, at the specified time.        |

Source: [ECMWF Parameter Database](https://codes.ecmwf.int/grib/param-db/)

Precipitation types:

- 0 = No precipitation
- 1 = Rain
- 3 = Freezing rain (i.e. supercooled raindrops which freeze on contact with the ground and other surfaces)
- 5 = Snow
- 6 = Wet snow (i.e. snow particles which are starting to melt)
- 7 = Mixture of rain and snow
- 8 = Ice pellets
- 12 = Freezing drizzle (i.e. supercooled drizzle which freezes on contact with the ground and other surfaces)

## Zonal Statistics

The derivation of the zonal statistics for each zones/areas is straightforward using GDAL.

```bash
gdal pipeline \
    read <raster path> ! \
    reproject --src-crs EPSG:4326 --dst-crs EPSG:32748 ! \
    zonal-stats --band 1 --zones [ read <vector mask> ] --stat count,min,max,sum,mean,stdev --pixel fractional ! \
    write --output-format CSV --output /vsistdout/
```

## References

Copernicus Climate Change Service (C3S). 2018. “ERA5 Hourly Data on Single Levels from 1940 to Present.” Copernicus Climate Change Service (C3S) Climate Data Store (CDS). doi:10.24381/CDS.ADBB2D47.

Owens, R., and Tim Hewson. 2018. “ECMWF Forecast User Guide.” doi:10.21957/M1CS7H.
