--
-- Bogor AgriSAT DB Schema v1.0
--

-- ------------------------------------------------------
-- Master
-- ------------------------------------------------------

CREATE TABLE zone_polygons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    level           TEXT NOT NULL,
    geometry_json   TEXT NOT NULL
);

CREATE TABLE zones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id        INTEGER NOT NULL, -- extent, city, subdistrict, rice_paddy 
    hash            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    city            TEXT NOT NULL,
    area            REAL NOT NULL,

    FOREIGN KEY(level_id) REFERENCES zone_polygons(id)
);

CREATE TABLE variables (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL, -- static, dynamic
    category        TEXT NOT NULL, -- topography, true_color, vegetation, chlorophyll, water stress
    key             TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL
);


-- ------------------------------------------------------
-- Transactional
-- ------------------------------------------------------

-- Environmental & Weather

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

    FOREIGN KEY(zone_id) REFERENCES zones(id)
);

CREATE UNIQUE INDEX ix_zonal_weather_zone_ts ON zonal_weather (zone_id, timestamp);

-- Chatbot

CREATE TABLE chat_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE chat_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    role            TEXT NOT NULL,
    contents        TEXT NOT NULL,
    created_at      TEXT NOT NULL,

    FOREIGN KEY(session_id) REFERENCES chat_sessions(id)
);

CREATE INDEX ix_chat_history_session_id ON chat_history (session_id);
