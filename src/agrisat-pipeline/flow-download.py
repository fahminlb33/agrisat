from prefect import serve

from downloaders.cdse_sentinel import download_sentinel_data

if __name__ == "__main__":
    f1 = download_sentinel_data.to_deployment(name="download-sentinel_2")

    serve(f1)
