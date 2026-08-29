const apiKey = "$2b$10$f4uwic0rmfNeH0WEtch25.hFwoA4gxK8jTdPV2VhGHw5WjjdNL5s6";
const cloudId = "split_v2_app_grp_test_" + Date.now();

async function test() {
  try {
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Name': cloudId,
        'X-Bin-Private': 'false'
      },
      body: JSON.stringify({ test: "hello" })
    });
    console.log("Create Status:", res.status);
    console.log("Create Response:", await res.text());
  } catch (err) {
    console.log("Create Error:", err);
  }

  try {
    const res = await fetch('https://api.jsonbin.io/v3/c/uncategorized/bins', {
      headers: {
        'X-Master-Key': apiKey,
      }
    });
    console.log("Search Status:", res.status);
    console.log("Search Response:", await res.text());
  } catch (err) {
    console.log("Search Error:", err);
  }
}
test();
