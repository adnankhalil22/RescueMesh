# Demonstration Guide

Prepared for a live FYP demonstration (≈ 10 minutes). Reset the data first so it looks fresh:
`npm --prefix backend run db:seed`.

## Setup (before the audience arrives)

1. Laptop and phone on the **same Wi-Fi** (a phone hotspot works: connect the laptop to it).
2. `npm run dev` → note the line *"On your network (use this in the mobile app): http://192.168.x.x:4000"*.
3. Open **http://localhost:5173** and sign in as `admin@rescuemesh.org` / `Admin@12345`.
4. `npm run mobile` → scan the QR code with **Expo Go**.
5. In the app, sign in as `victim@rescuemesh.org` / `Victim@1234`. If it says *Server unreachable*: Login screen →
   *Server: … (change)* → enter the address from step 2 → *Test & save*.
6. Allow location access when asked.

## 1. Online SOS → dashboard (main success criterion)

1. Phone: **Home** shows *Online*, *GPS ready*, *0 pending*.
2. Tap **SOS** → choose *Trapped person* (priority becomes Critical automatically) → set people → add a short
   description → **SEND SOS**.
3. The status screen shows the delivery timeline reaching **DELIVERED**.
4. Dashboard: **Overview** totals increase within a few seconds; the request appears in *Recent SOS requests*,
   on the **Live Map** (red marker at the phone's GPS position — click it for ID, type, location, priority, time,
   status) and in **Emergencies**.

## 2. Responder updates the status

Either in the dashboard (Emergencies → click the row → *Accept & assign to me* → *Mark In Progress* → *Mark Resolved*)
or on a second phone signed in as `responder@rescuemesh.org` / `Responder@123` (Incoming → request → Accept → Mark In
Progress → Mark Resolved).

On the victim's phone, **My Requests** (pull to refresh) or the request screen shows *Responder assigned* →
*Rescue in progress* → *Resolved* with the responder's name and timeline.

## 3. Offline SOS and automatic synchronisation

1. Phone: **Profile → Settings → Simulate no connectivity** ON (or switch on airplane mode — GPS still works).
2. Home shows **Offline** and the yellow banner.
3. Send an SOS → *Saved on phone / QUEUED*. Dashboard: it does **not** appear (nothing reached the server).
4. Optional: fully close the app and reopen it → the request is still there with *Queued* (stored in SQLite).
5. Switch offline mode OFF (or airplane mode off). Within ~15 s the app detects the server, uploads the queue and the
   request turns **DELIVERED**; the Home pending counter goes back to 0.
6. Dashboard: the request appears with channel **"Offline → synced"**, its *Created on device* time is the original
   offline time, and *Received by server* is later.
7. Communication page → *Duplicates blocked* shows server-side de-duplication of any repeated uploads.

## 4. Simulated LoRa mesh (clearly labelled as simulation)

Dashboard → **Communication**:

1. Point out the banner: *Simulation mode … Hardware connected: no*.
2. *From node* **EP-01** → **Transmit SOS** → trace shows `ORIGIN → TX/RX` hop by hop, **2 duplicates dropped** in
   the relay triangle, **Delivered to gateway after 4 hops**, packet size within one LoRa frame, and *Server ingest:
   ACCEPTED*. The SOS appears in Emergencies with channel *LoRa mesh (simulated)*.
3. **Re-send same message** → `DUPLICATE_DROPPED` at the origin; nothing new is stored.
4. *From node* **EP-03** → Transmit → *No route — held for retry* (relay RL-05 is powered off); *Pending packets* = 1.
5. Node table → RL-05 **Power on** → message *"Store-and-forward retried 1 held packet(s): 1 delivered"*.
6. Power off **RL-01** and transmit from EP-01 → no route to the gateway (mesh partition); power it on again → delivered.
7. Settings → *LoRa max hops* = 3 → transmit from EP-01 → `HOP_LIMIT` at RL-01 (the gateway is 4 hops away), so the
   packet is not delivered and is kept as pending. Set max hops back to 6: the held packet is retried with the new
   limit and delivered automatically.

## 5. Other things worth showing

- Emergencies: search, filter by type/priority/status, sort by priority, archive (admin).
- Users: change a citizen to Responder; deactivate an account (its existing token is refused with
  *Account is deactivated* on the very next request, and it can no longer sign in).
- Settings: organization name, map centre, refresh interval, profile, password.
- Mobile: Location screen → *Share my location* / *Send location update to responders* (the marker moves on the map).

## Honest limitations to state if asked

- LoRa forwarding is a software simulation; ESP32 firmware and radio tests are future work (see LORA_INTEGRATION.md).
- Phones cannot reach the server without some IP network; offline mode guarantees no data loss and automatic
  delivery later, not delivery without any link.
- Dashboard map tiles come from OpenStreetMap and need internet on the dashboard computer.
