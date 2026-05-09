import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/satellite", tags=["Satellite"])

CELESTRAK_EARTH_TLE = (
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle"
)


@router.get("")
async def list_satellites():
    res = httpx.get(CELESTRAK_EARTH_TLE)
    lines = res.text.splitlines()
    lines = [x.strip() for x in lines]

    items = []
    for i in range(0, len(lines), 3):
        items.append({"id": lines[i].strip(), "tle": "\n".join(lines[i + 1 : i + 3])})

    return sorted(items, key=lambda x: x["id"])
