--
-- Bogor AgriSAT DB Schema v1.0
--

-- ------------------------------------------------------
-- Master
-- ------------------------------------------------------


CREATE TABLE variables (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL, -- static, dynamic
    category        TEXT NOT NULL, -- topography, true-color, vegetation, chlorophyll, water_stress
    key             TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL
);

CREATE UNIQUE INDEX ix_variables_key ON variables (key);

CREATE TABLE zone_level (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    level           TEXT NOT NULL, -- extent, kota, kecamatan, sawah 
    geometry_json   TEXT NOT NULL
);

CREATE UNIQUE INDEX ix_zone_level_level ON zone_level (level);

CREATE TABLE zones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id        INTEGER NOT NULL,
    hash            TEXT NOT NULL,
    name            TEXT NOT NULL,
    city            TEXT NOT NULL,
    area            REAL NOT NULL,

    FOREIGN KEY(level_id) REFERENCES zone_level(id)
);

CREATE UNIQUE INDEX ix_zones_hash ON zones (hash);


-- ------------------------------------------------------
-- Transactional
-- ------------------------------------------------------


CREATE TABLE zonal_raster (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    variable_id     INTEGER NOT NULL,
    timestamp       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    raster_data     BLOB NOT NULL,

    FOREIGN KEY(variable_id) REFERENCES variables(id)
);

CREATE UNIQUE INDEX ix_zonal_raster_variable_ts ON zonal_raster (variable_id, timestamp);

CREATE TABLE zonal_statistics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id         INTEGER NOT NULL,
    timestamp       TEXT NOT NULL,
    -- Vegetation Index
    ndvi            REAL NOT NULL,
    gndvi           REAL NOT NULL,
    wdrvi           REAL NOT NULL,
    msavi           REAL NOT NULL,
    -- Chlorophyll Index
    ndre            REAL NOT NULL,
    cire            REAL NOT NULL,
    -- Water Stress Index
    ndmi            REAL NOT NULL,
    ndwi            REAL NOT NULL,

    FOREIGN KEY(zone_id) REFERENCES zones(id)
);

CREATE UNIQUE INDEX ix_zonal_statistics_zone_ts ON zonal_statistics (zone_id, timestamp);

CREATE TABLE zonal_weather (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id         INTEGER NOT NULL,
    timestamp       TEXT NOT NULL,
    temperature     REAL NOT NULL,
    precipitation   REAL NOT NULL,
    cloud_cover     REAL NOT NULL,
    is_raining      BOOLEAN NOT NULL,

    FOREIGN KEY(zone_id) REFERENCES zones(id)
);

CREATE UNIQUE INDEX ix_zonal_weather_zone_ts ON zonal_weather (zone_id, timestamp);
