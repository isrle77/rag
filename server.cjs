const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
app.use(bodyParser.json());
app.use(express.static("."));

const client_id = "hqhnfj5bjtx5hfkcgq8pf3";
const secret = "c23a03657b0742babcf9a7f6081bcda6";
const device_id = "bf687cbc0a129f0a97i83p";

function getSign(secret, client_id, t) {
  const message = client_id + t;
  return crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex")
    .toUpperCase();
}

async function getToken() {
  const t = Date.now().toString();
  const sign = getSign(secret, client_id, t);

  try {
    const response = await axios.get(
      "https://openapi.tuyaeu.com/v1.0/token?grant_type=1",
      {
        headers: {
          client_id: client_id,
          sign: sign,
          t: t,
          sign_method: "HMAC-SHA256",
        },
      }
    );

    console.log("Token response:", response.data);
    return response.data.result?.access_token;
  } catch (error) {
    console.error("שגיאה בקבלת Access Token:");
    console.error(error.response?.data || error.message);
    throw error;
  }
}

app.post("/control", async (req, res) => {
  try {
    const state = req.body.state;
    const token = await getToken();

    const commandResponse = await axios.post(
      `https://openapi.tuyaeu.com/v1.0/devices/${device_id}/commands`,
      {
        commands: [{ code: "switch_1", value: state }],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("Command response:", commandResponse.data);
    res.send(state ? "השקע הופעל בהצלחה" : "השקע כובה בהצלחה");
  } catch (error) {
    console.error("שגיאה בשליחת הפקודה לשקע:");
    console.error(error.response?.data || error.message);
    res.status(500).send("שגיאה בשליחת הפקודה לשקע");
  }
});

app.listen(3000, () => {
  console.log("השרת פועל בכתובת http://localhost:3000");
});
