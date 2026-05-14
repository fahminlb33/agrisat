import re
import sqlite3
import pathlib
import argparse

import pandas as pd

from rich import print

# ------------------------------------------------------
# Functions
# ------------------------------------------------------


def parse_timestamp(s: str):
    ts = re.search(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})", s)
    return f"{ts.group(1)}-{ts.group(2)}-{ts.group(3)} {ts.group(4)}:{ts.group(5)}:{ts.group(6)}"


def get_sql(is_environment: bool) -> str:
    if is_environment:
        return """
        INSERT INTO zonal_statistics (zone_id, timestamp, ndvi, gndvi, wdrvi, msavi, ndre, cire, ndmi, ndwi)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (zone_id, timestamp) DO NOTHING
        """

    return """
    INSERT INTO zonal_weather (zone_id, timestamp, temperature, precipitation, cloud_cover, is_raining)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (zone_id, timestamp) DO NOTHING
    """

# ------------------------------------------------------
# Data Loading
# ------------------------------------------------------

def load_data(db: sqlite3.Connection, stats_path: str):
    cursor = db.cursor()

    # load zone hash mapping
    cursor.execute("SELECT id, hash FROM zones")
    resultset = cursor.fetchall()
    hash_id_map = {k[1]: k[0] for k in resultset}

    # load the dataset
    df = pd.read_csv(stats_path)
    dd = df.pivot_table(index=["timestamp", "hash"], columns="variable", values="mean")
    dd = dd.reset_index()
    print(dd.head())

    data = []
    is_environment = "ndvi" in dd.columns

    # process rows
    for _, row in dd.iterrows():
        zone_id = hash_id_map[row["hash"]]
        timestamp = parse_timestamp(row["timestamp"])

        if is_environment:
            data.append(
                (
                    zone_id,
                    timestamp,
                    row["ndvi"],
                    row["gndvi"],
                    row["wdrvi"],
                    row["msavi"],
                    row["ndre"],
                    row["cire"],
                    row["ndmi"],
                    row["ndwi"],
                )
            )
        else:
            data.append(
                (
                    zone_id,
                    timestamp,
                    row["t2m"],
                    row["tp"],
                    row["tcc"],
                    1 if row["ptype"] > 0 else 0,
                )
            )

    # save to DB
    cursor.executemany(get_sql(is_environment), data)
    db.commit()


# ------------------------------------------------------
# Main Entry
# ------------------------------------------------------


def main(args):
    con = sqlite3.connect(args["db"])

    print("Loading data...")
    for path in pathlib.Path(args["data_dir"]).glob("*.csv"):
        print(f"Loading: {path.name}")
        load_data(con, path)

    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        type=str,
        default="/home/fahmi/workspace/projects/bogor-agrisat/src/agrisat-api/data.db",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default="/mnt/data/workspace/bogor-agrisat/data/production-data/attributes",
    )

    args = vars(parser.parse_args())

    print(args)
    main(args)
