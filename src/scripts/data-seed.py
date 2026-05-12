import sqlite3
import argparse
from pathlib import Path

import pandas as pd
import geopandas as gpd

from rich import print

# ------------------------------------------------------
# Database Migration
# ------------------------------------------------------


def migrate_schema(db: sqlite3.Connection, schema_path: Path):
    cursor = db.cursor()

    # check if the DB has already migrated
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    table_names = [x[0] for x in cursor.fetchall()]

    if any(table_names) and "zonal_statistics" in table_names:
        print("Database already migrated")
        return

    # apply migrations
    with schema_path.open("r") as f:
        cursor.executescript(f.read())

# ------------------------------------------------------
# Database Seeding
# ------------------------------------------------------

def seed_variables(db: sqlite3.Connection, vars_path: str):
    cursor = db.cursor()

    # load variable details
    df = pd.read_excel(vars_path)
    df = df[["type", "category", "key", "name", "description"]]
    rows = df.to_records(index=None).tolist()

    # save to DB
    cursor.executemany(
        """
        INSERT INTO variables (type, category, key, name, description)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (key) DO NOTHING
        """,
        rows,
    )
    db.commit()


def seed_zones(db: sqlite3.Connection, vector_path: Path):
    cursor = db.cursor()

    # insert zone level
    level = vector_path.stem[6:]
    geom_json = vector_path.open("r").read()

    statement = cursor.execute(
        """
        INSERT INTO zone_level (level, geometry_json)
        VALUES (?, ?)
        ON CONFLICT (level) DO NOTHING
        RETURNING id
        """,
        (level, geom_json),
    )
    level_id = statement.fetchone()[0]

    # insert zone polygons
    gdf = gpd.read_file(vector_path)
    gdf = gdf.drop(columns=["geometry"])
    gdf = gdf.assign(level_id=level_id)
    gdf = gdf[["level_id", "hash", "name", "city", "area"]]
    rows = gdf.to_records(index=None).tolist()

    # save to DB
    cursor.executemany(
        """
        INSERT INTO zones (level_id, hash, name, city, area)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (hash) DO NOTHING
        """,
        rows,
    )
    db.commit()


# ------------------------------------------------------
# Main Entry
# ------------------------------------------------------


def main(args):
    con = sqlite3.connect(args["db"])

    print("Running database schema migration...")
    migrate_schema(con, Path(args["schema"]))

    print("Running variable seeding...")
    seed_variables(con, Path(args["variables"]))

    print("Running zones seeding...")
    for path in Path(args["zones"]).glob("*.geojson"):
        print(f"Seeding: {path.name}")
        seed_zones(con, path)

    print("Commiting changes...")
    con.commit()
    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        type=str,
        default="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/data.db",
    )
    parser.add_argument(
        "--schema",
        type=str,
        default="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/schema.sql",
    )
    parser.add_argument(
        "--zones",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/area-of-interest",
    )
    parser.add_argument(
        "--variables",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/attributes/variables.xlsx",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)
