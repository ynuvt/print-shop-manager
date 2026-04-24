import axios from 'axios';
async function run() {
  try {
    const res = await axios.get("http://localhost:4000/api/v1/jobs/review/b279b48c-9784-4d22-b5e1-5f2122650058", {
      headers: { authorization: "Bearer invalid" } // even without auth it should log the error
    });
    console.log(res.data);
  } catch (e: any) {
    console.error(e.response?.data);
  }
}
run();
