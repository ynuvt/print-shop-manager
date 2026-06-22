import axios from "axios";

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI4NzIxM2ExZi0wZDJiLTRkYTItYWRhMC02MDRhZDdhODMwYWUiLCJyb2xlIjoiY3VzdG9tZXIiLCJjcmVhdGVkQXQiOjE3ODIwOTI2Njg3NDEsImlhdCI6MTc4MjA5MjY2OH0.3AED_dXIQwOMNS0BGVGqmUwmcPcAGTgICX6TbMK2CP4";

async function run() {
  try {
    const res = await axios.post(
      "http://localhost:4001/api/v1/jobs/web-draft/add-files",
      {
        files: [
          {
            name: "avatar.png",
            url: "https://avatars.githubusercontent.com/u/14101776",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    console.log("Response:", res.status, res.data);
  } catch (error: any) {
    console.error("Error status:", error.response?.status);
    console.error("Error data:", error.response?.data);
  }
}
run();
