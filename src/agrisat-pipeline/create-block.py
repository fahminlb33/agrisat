from prefect.blocks.core import Block
from prefect.blocks.system import Secret


class CDSEConfig(Block):
    cdse_stac_endpoint: str
    cdse_s3_endpoint: str
    cdse_s3_access_key: Secret
    cdse_s3_secret_key: Secret


ddd = CDSEConfig(
    cdse_stac_endpoint="https://stac.dataspace.copernicus.eu/v1",
    cdse_s3_endpoint="https://eodata.dataspace.copernicus.eu",
    cdse_s3_access_key=Secret(value="64THSBS3B0SDZ7SRYOC4"),
    cdse_s3_secret_key=Secret(value="84yu7bQuQTTcsGyCoQrdPEqf2wVdFGdXY1MdciHp"),
)

ddd.save("agrisat-cdse")
