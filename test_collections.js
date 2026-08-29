const apiKey = "$2b$10$f4uwic0rmfNeH0WEtch25.hFwoA4gxK8jTdPV2VhGHw5WjjdNL5s6";

async function test() {
  try {
    const res = await fetch('https://api.jsonbin.io/v3/c', {
      headers: {
        'X-Master-Key': apiKey,
      }
    });
    console.log("Collections:", await res.text());
  } catch (err) {
    console.log("Error:", err);
  }
}
test();
