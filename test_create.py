import urllib.request
import json
import time

key = "$2b$10$f4uwic0rmfNeH0WEtch25.hFwoA4gxK8jTdPV2VhGHw5WjjdNL5s6"
cloudId = "split_v2_app_grp_test_" + str(int(time.time()))

req = urllib.request.Request(
    "https://api.jsonbin.io/v3/b",
    data=json.dumps({"test": "hello"}).encode(),
    headers={
        "Content-Type": "application/json",
        "X-Master-Key": key,
        "X-Bin-Name": cloudId,
        "X-Bin-Private": "false"
    },
    method="POST"
)
try:
    with urllib.request.urlopen(req) as resp:
        print("Create Status:", resp.status)
        print("Create Response:", resp.read().decode())
except Exception as e:
    print("Create Error:", e)

# Now search
req = urllib.request.Request(
    "https://api.jsonbin.io/v3/c/uncategorized/bins",
    headers={
        "X-Master-Key": key,
    }
)
try:
    with urllib.request.urlopen(req) as resp:
        print("Search Status:", resp.status)
        print("Search Response:", resp.read().decode())
except Exception as e:
    print("Search Error:", e)
