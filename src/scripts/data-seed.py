import sqlite3
import pathlib
import argparse

import pandas as pd
import geopandas as gpd

from rich import print

# ------------------------------------------------------
# Database Migration and Seeding
# ------------------------------------------------------


def migrate_schema(db: sqlite3.Connection, schema_path: str):
    cursor = db.cursor()

    # check if the DB has already migrated
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    table_names = cursor.fetchall()

    if any(table_names) and "zonal_statistics" in [x[0] for x in table_names]:
        print("Database already migrated")
        return

    # apply migrations
    with open(schema_path, "r") as f:
        cursor.executescript(f.read())


def seed_zones(db: sqlite3.Connection, vector_path: str):
    cursor = db.cursor()

    gdf = gpd.read_file(vector_path).drop(columns=["geometry"])
    gdf = gdf[["hash", "level", "name", "city", "area"]]
    rows = gdf.to_records(index=None).tolist()

    cursor.executemany(
        """
        INSERT INTO zones (hash, level, name, city, area)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (hash) DO NOTHING
        """,
        rows,
    )


def seed_variables(db: sqlite3.Connection, vars_path: str):
    cursor = db.cursor()

    df = pd.read_excel(vars_path)
    df = df[["type", "category", "key", "name", "description", "wmts_url"]]
    rows = df.to_records(index=None).tolist()

    cursor.executemany(
        """
        INSERT INTO variables (type, category, key, name, description, wmts_url)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (key) DO NOTHING
        """,
        rows,
    )


# ------------------------------------------------------
# Main Entry
# ------------------------------------------------------


def main(args):
    con = sqlite3.connect(args["db"])

    print("Running database schema migration...")
    migrate_schema(con, args["schema"])

    print("Running variable seeding...")
    seed_variables(con, args["variables"])

    print("Running zones seeding...")
    for path in pathlib.Path(args["zones"]).glob("*.geojson"):
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
