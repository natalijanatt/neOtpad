# Sensor telemetry

What a container sensor sends over LoRaWAN, and what the backend is allowed to
conclude from each field. This is the input side of the whole system: fill
forecasting, route optimisation and the risk map all start here.

## Payload fields

| Field | Unit | Description |
|---|---|---|
| **Distance** | cm | Raw measured distance from the sensor head to the top of the waste. |
| **Fill level** | % | Computed **on the device**: the sensor's microcontroller converts distance to a percentage using the container depth configured on it (e.g. `85%`). |
| **Ambient temperature** | °C | Temperature inside the container. Used for fire detection — above **70 °C** the device sends an out-of-band fire alarm. |
| **Tilt / orientation** | gyro + accelerometer | Whether the container is upright, tipped over, or currently being emptied. |
| **Battery level** | mV and/or % | Lithium battery voltage (e.g. `3.6 V` / `92%`), for planning preventive replacement. |
| **Status / diagnostics** | error codes | Device health, e.g. optics blocked or dirty, sensor fault. |

## What the backend may and may not conclude

- **Fill % is device-computed, so container depth is device configuration.** The
  percentage is only as correct as the depth entered on that unit. Store the
  configured depth alongside the device record, keep the raw `distance_cm` in
  every reading, and recompute server-side when a depth is corrected —
  otherwise a mis-configured unit silently poisons its whole history.
- **A diagnostic code outranks the measurement.** Blocked or dirty optics
  typically read as a very short distance, i.e. "full". A reading that arrives
  with a fault code must **not** raise routing priority; it raises a maintenance
  task. Treating it as a full container is the most likely way this system sends
  a truck for nothing.
- **Tilt is two different events.** *Tipped over* is an incident (spilled waste,
  probable overflow report, possible vandalism). *Emptying* is the implicit
  confirmation that a truck actually serviced the container — a free ground
  truth for checking that the planned route was driven, and the natural reset
  point of a fill curve.
- **Fire bypasses the daily plan.** The >70 °C alarm is not a routing input; it
  is an immediate alert to the utility and, depending on severity, to emergency
  services. It must not wait for the nightly optimisation run.
- **Battery drives its own route.** Voltage trending down schedules a
  replacement visit, ideally folded into a collection round that already passes
  the location. A dead unit also means a settlement silently stops reporting —
  treat prolonged silence as a data gap, not as "container is empty".
- **Missing readings are not zeros.** Rural LoRaWAN coverage will drop packets.
  The forecasting model gets an explicit gap, never an interpolated value posing
  as a measurement.

## Proposed normalised shape (after decoding)

Not the on-air format — this is what the ingest endpoint stores once the LoRaWAN
payload is decoded. It exists so the API contract has something concrete to be
generated from; adjust it when the real device is chosen.

```jsonc
{
  "deviceId": "eui-70b3d57ed0060a1c",
  "containerId": "PI-KRU-004",
  "measuredAt": "2026-09-18T04:12:07Z",   // device clock, UTC
  "receivedAt":  "2026-09-18T04:12:09Z",  // server clock
  "distanceCm": 27,
  "fillPercent": 85,
  "temperatureC": 21.4,
  "orientation": "upright",               // upright | tipped | emptying
  "batteryMv": 3600,
  "batteryPercent": 92,
  "status": ["ok"],                       // or e.g. ["optics_blocked"]
  "rssi": -113,
  "snr": -7.5
}
```

Notes on the shape:

- Keep `distanceCm` **and** `fillPercent`. The first is the measurement, the
  second is a device-side derivation that may need recomputing.
- Keep both timestamps. Store-and-forward and retries mean they diverge, and
  only `measuredAt` belongs on a fill curve.
- `rssi` / `snr` are the input for judging gateway placement — which villages a
  given gateway really covers is an empirical question, not a map exercise.
- `status` is a list: a unit can be both low on battery and dirty.

## The reading history in the database, before any hardware

No sensor is installed in Pirot, so every row in `ocitavanje` today is *computed*
rather than measured. `supabase/migrations/20260918122100_ocitavanja_senzora.sql`
installs `app.generisi_ocitavanja()`, which derives the history from data the
sources do state, and the split between the two matters when reading anything
built on it:

| Input | Where it comes from |
|---|---|
| households behind a container | `sabirno_mesto.broj_domacinstava` ÷ containers at the point, from JP Komunalac's 2018 plan |
| container volume | `kontejner.zapremina_l` — 1100 L, documented |
| collections per week | `pokrivenost_naselja.odvoz_nedeljno` — 1–3, documented per village |
| season, for temperature | day of the year; Pirot's ~0 °C January and ~21 °C July |

Four things are assumptions, not sources, and each is a function argument or a
named constant so it can be replaced rather than hunted for:

- **15 L per household per day.** The yardstick is the utility's own sizing:
  containers × 1100 L × collections per week ÷ (7 × households) is the capacity it
  planned for, and across the 23 documented villages that lands between 8 and
  23 L, median ≈ 20. At 15 L a typically provisioned village is ~¾ full when the
  truck arrives and an under-provisioned one overflows before it.
- **110 cm sensor depth** for a 1100 L four-wheel unit, sensor on the lid. It
  lives on `uredjaj_montaza`, not on the container, for the reason above.
- **Six-hour uplink cadence.** A generation step, *not* a decision — the real
  cadence is still open, below.
- **One gateway at the city centre** (`gw-pirot-centar`), where the depot is.
  `rssi`/`snr` are the log-distance estimate for that single placement: −95 dBm at
  a kilometre, 25 dB per decade. Their worth is showing which villages one gateway
  cannot reach — Dojkinci at ~20 km reads as marginal because it is.

What is deliberately absent: no fire, no tipped container, no blocked optics, no
dropped uplinks, no flat battery. Every one of those is real device behaviour with
a column and an alarm type waiting for it, but writing one in would put an
incident in the record that never happened.

**Overflow is the exception, because it is derived rather than staged.** Where the
documented household-to-container ratio cannot wait for the documented collection
day, the curve reaches 100 % on its own and a `prelivanje` alarm follows.
Berilovac — 564 households, 15 containers, twice a week — is the worst case in the
data, and that is a finding about Pirot rather than a scenario someone chose.

`fill_percent` is derived **from** `distance_cm` rather than computed beside it, so a
row can never carry a percentage its own measurement contradicts. One visible
consequence: a container packed to the lid reads 2 cm and therefore **98 %**, not
100 %. A real unit has a far larger blind zone — 25–30 cm is typical for ultrasonic
bin sensors — which would cap the reported percentage much lower; that is a
device-selection question, in the list below.

Two thresholds are decided here and used by the generated rows:

- **Overflow** is the first reliable reading of a collection cycle at **≥ 95 %**,
  closed by the emptying that ends the cycle. An alarm still open therefore means
  a container overflowing right now.
- **Silence** is **two missed uplinks**, which sets `kontejner_stanje.tih_od`.
  Provisional, because it follows from the cadence, which is not decided.

The series is anchored to the moment it was generated, so it goes stale on its own:
once real time moves past the window, the silence rule marks every container quiet
— correct for a data gap, wrong for a demo, and indistinguishable from the real
thing until someone looks at the dates. Bring it to the present with one call,
which clears its own window and rewrites it:

```sql
select * from app.generisi_ocitavanja();
-- or with a different assumption: app.generisi_ocitavanja(litara_dnevno_po_domacinstvu => 18)
```

## Not yet decided

- Uplink cadence (a fixed interval vs. report-on-change with a heartbeat) and
  whether the device can be reconfigured downlink.
- The sensor's **blind zone** — the closest distance it can still measure, 25–30 cm
  on typical ultrasonic units. It caps the highest percentage a full container can
  ever report, so it decides whether an overflow threshold expressed in per cent is
  reachable at all, and it has to be known before the depth is configured.
- Payload encoding and the LoRaWAN port mapping per message type.
- Network server in front of the API (ChirpStack / TTN / operator) and the shape
  of its webhook — this determines where the decoder lives.
- Exact fire threshold and escalation path; 70 °C is the sensor's alarm trigger,
  the utility's procedure on top of it is unwritten.
- Device/container identity: whether `deviceId` maps 1:1 to a container for good,
  and how a swapped unit keeps the container's history intact.
