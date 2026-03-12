# Apollo Traders Management System

A lightweight **Cloudflare Workers–based web application** for managing **bank accounts and vehicle document expiries** with automated alerts, license control, and a simple mobile-friendly dashboard.

This system is designed to run **serverless**, using **Cloudflare Workers + KV storage**, making it fast, secure, and extremely low maintenance.

---

# 🚀 Overview

This project provides a centralized dashboard to manage:

* 🏦 Bank account information
* 🚗 Vehicle documents and expiry tracking
* 🔔 Automatic expiry alerts
* 📲 Telegram notification reminders
* 🔐 License system for application usage
* 🧰 Admin and Super-Admin management tools

The application runs entirely on **Cloudflare's edge network** without needing a traditional backend server.

---

# ✨ Key Features

## 📊 Dashboard

* Shows **vehicle document expiry warnings**
* Highlights **expired documents**
* Clickable warnings that open the vehicle and highlight the record
* Flash + shake animation for critical warnings

---

## 🏦 Bank Management

* Store multiple bank accounts
* Search functionality
* Copy account information instantly
* Share via:

  * SMS
  * WhatsApp

Fields stored:

* Bank Name
* Account Title
* Account Number
* Routing Number
* Branch

---

## 🚗 Vehicle Document Tracking

Supports tracking of:

* Registration Certificate (Smart Card)
* Fitness Certificate
* Tax Token
* Insurance Certificate
* Custom document types

Each record includes:

* Vehicle Name
* Car Number
* Document Type
* Expiry Date

### Expiry Warning System

| Days Remaining | Warning          |
| -------------- | ---------------- |
| 30 days        | Early warning    |
| 15 days        | Medium warning   |
| 7 days         | Critical warning |
| Expired        | Red alert        |

---

## 🔔 Automatic Alerts

The system automatically sends reminders when documents approach expiry.

### Telegram Alerts

Alerts include:

```
⚠ 5 days remaining

Vehicle: Truck
Car: DHA-1234
Document: Tax Token
Expiry: 2026-03-10
```

### Anti-Spam Protection

Only **one alert per vehicle document per day** is sent.

---

## 🔐 License System

The application includes a built-in **license expiry system**.

Features:

* Static license expiry date
* KV-based renewable license
* Super-admin renewal control
* Dashboard license warning

Example footer:

```
License: Active | Exp: 2026-12-31 | 120 days left
```

---

## 👨‍💼 Admin Features

### Admin Panel

Allows:

* Add bank accounts
* Add vehicle documents
* Delete records
* Instant live update

---

## 🔑 Super-Admin Panel

Hidden control panel for license management.

Accessible via:

```
/super-admin
```

Capabilities:

* View license status
* View expiry date
* View remaining days
* Renew license

---

## 📱 Mobile Friendly UI

Designed for mobile use:

* Responsive layout
* 3-dot menu navigation
* Quick copy/share buttons
* Lightweight interface

---

# 🗂 Project Structure

```
worker.js
README.md
```

Main components inside the Worker:

```
handleRequest()
safeList()
checkVehicleAlerts()
sendTelegram()
layout()
homePage()
banksPage()
vehiclesPage()
addBankPage()
addVehiclePage()
adminPage()
superAdminPage()
```

---

# ⚙️ Technology Stack

* **Cloudflare Workers**
* **Cloudflare KV Storage**
* **Vanilla JavaScript**
* **HTML + CSS**
* **FontAwesome Icons**
* **Telegram Bot API**

---

# 🔔 Notification System

Vehicle alerts are processed using:

```
checkVehicleAlerts()
```

Logic:

```
Expiry <= 30 days → warning
Expiry <= 15 days → stronger warning
Expiry <= 7 days → critical warning
Expired → immediate alert
```

Alerts are stored in KV using:

```
alert:carNumber:docType:date
```

This prevents duplicate alerts.

---

# 🧩 Environment Variables

The system requires these constants:

```
TELEGRAM_BOT
TELEGRAM_CHAT
```

Example:

```
const TELEGRAM_BOT = "YOUR_BOT_TOKEN";
const TELEGRAM_CHAT = "YOUR_CHAT_ID";
```

---

# ☁️ Deployment Guide

## 1️⃣ Install Wrangler

```
npm install -g wrangler
```

Login to Cloudflare:

```
wrangler login
```

---

## 2️⃣ Create Worker Project

```
wrangler init apollo-traders
```

Replace the generated `worker.js` with this project code.

---

## 3️⃣ Create KV Namespace

Create KV storage:

```
wrangler kv:namespace create DATA_STORE
```

You will get:

```
id = "xxxxxxxxxxxxxxxx"
```

Add it to `wrangler.toml`:

```
kv_namespaces = [
  { binding = "DATA_STORE", id = "YOUR_NAMESPACE_ID" }
]
```

---

## 4️⃣ Deploy Worker

Deploy using:

```
wrangler deploy
```

Your app will be available at:

```
https://your-worker-name.your-subdomain.workers.dev
```

---

# ⏰ Automated Expiry Alerts (Cron)

You can run alert checks automatically using **GitHub Actions**.

Example workflow:

```
.github/workflows/cron.yml
```

```
name: Vehicle Expiry Check

on:
  schedule:
    - cron: '0 3 * * *'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Call Worker
        run: curl https://your-worker-url
```

This runs every day and triggers:

```
checkVehicleAlerts()
```

---

# 🔒 Security Notes

* Login protected by **PIN authentication**
* Super-admin license control
* Serverless infrastructure
* No public database exposure
* KV-based secure storage

---

# 📌 Future Improvements

Possible upgrades:

* WhatsApp Cloud API alerts
* Multi-user support
* Role-based access
* Vehicle expiry analytics
* Export to PDF/Excel
* Document upload support

---

# 📄 License

This project is provided for **private/internal use**.

---

# 👨‍💻 Author

Developed for **Apollo Traders** to manage banking information and vehicle compliance efficiently using a serverless infrastructure.

---

# ⭐ Support

If you find this project useful:

⭐ Star the repository
🔔 Enable notifications for updates

---
