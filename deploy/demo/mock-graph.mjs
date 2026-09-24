// Yerel demo için sahte Meta Graph API: gerçek WhatsApp'a hiçbir şey göndermez,
// her mesaja ve şablon başvurusuna başarılı bir yanıt döner.
import { createServer } from "node:http";

let n = 0;
createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.endsWith("/messages")) return res.end(JSON.stringify({ messages: [{ id: `wamid.DEMO${++n}` }] }));
    if (req.url.endsWith("/message_templates")) return res.end(JSON.stringify({ id: String(900000 + ++n), status: "PENDING" }));
    res.statusCode = 404;
    res.end("{}");
  });
}).listen(4000, () => console.log("Sahte Meta Graph API :4000"));
