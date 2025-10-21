
# ChatHub - Birleşik Mesajlaşma Uygulaması

ChatHub, WhatsApp, Telegram, Twitter, Instagram ve Bluesky gibi çeşitli platformlardaki sohbetlerinizi tek bir birleşik gelen kutusunda toplayan bir mobil uygulamadır. Matrix protokolü üzerine inşa edilmiştir; React Native(Expo) ile geliştirilmiş bir ön yüz ve platform köprüleriyle iletişim kuran bir Node.js proxy sunucusu kullanır.

## Özellikler

- **Birleşik Gelen Kutusu:** Tüm bağlı platformlardaki mesajları tek bir yerden görüntüleyin ve yanıtlayın.
- **Çoklu Platform Desteği:** WhatsApp, Telegram, Twitter, Instagram ve Bluesky'ye bağlanır.
- **Anlık Bildirimler:** Yeni mesajlar için gerçek zamanlı bildirimler alın.
- **Medya Desteği:** Resim, video ve sesli mesajlar gönderip alın.

## Uygulama İçi Görüntüler

Uygulamanın arayüzünü ve temel özelliklerini gösteren ekran görüntüleri için lütfen projenin kök dizininde bulunan `ChatHub.pdf` dosyasını inceleyin.

## Teknolojiler

- **Mobil Uygulama:** React Native (Expo ile)
- **Arka Uç Proxy:** Node.js (Express ile)
- **Gerçek Zamanlı İletişim:** Matrix Protokolü (`matrix-js-sdk`), WebSockets
- **Anlık Bildirimler:** Firebase (Expo aracılığıyla)

## Proje Yapısı

- `/mobile`: React Native (Expo) mobil uygulamasının kaynak kodlarını içerir.
- `/proxy_server`: Mobil uygulama ile Matrix sunucusu arasında bir proxy görevi gören Node.js arka uç sunucusunu içerir.

## Ön Gereksinimler

- Çalışan bir Matrix sunucusu (örneğin, Synapse) ve üzerine kurulmuş gerekli köprüler (mautrix-whatsapp, mautrix-telegram vb.).
- Node.js ve npm'in yüklü olması.
- Expo CLI'ın yüklü olması (`npm install -g expo-cli`).
- Anlık bildirimler için bir Firebase hesabı.

## Kurulum Talimatları

### 1. Arka Uç Kurulumu (`proxy_server`)

Proxy sunucusu, Matrix sunucunuzla olan iletişimi yönetir.

1.  **Sunucu dizinine gidin:**
    ```bash
    cd proxy_server
    ```

2.  **Bağımlılıkları yükleyin:**
    ```bash
    npm install
    ```

3.  **Ortam değişkenlerini yapılandırın:**
    Örnek dosyayı kopyalayarak bir `.env` dosyası oluşturun:
    ```bash
    cp .env.example .env
    ```
    Şimdi `.env` dosyasını açın ve kendi ortamınıza göre doldurun:
    - `MATRIX_URL`: Matrix sunucunuzun adresi (örn: `http://localhost:8008`).
    - `DOMAIN_NAME`: Matrix sunucunuzun alan adı (örn: `ornek.com`).
    - `SERVER_IP`: Proxy sunucuyu çalıştıran makinenin yerel IP adresi (mobil cihazınızın erişebileceği bir adres olmalı, örn: `http://192.168.1.10`).

4.  **Sunucuyu başlatın:**
    ```bash
    node server.mjs
    ```
    Sunucu şimdi 3000 portunda çalışıyor olmalı.

### 2. Mobil Uygulama Kurulumu (`mobile`)

Mobil uygulama, ChatHub'ın kullanıcı arayüzüdür.

1.  **Mobil uygulama dizinine gidin:**
    ```bash
    cd ../mobile
    ```

2.  **Bağımlılıkları yükleyin:**
    ```bash
    npm install
    ```

3.  **Firebase'i yapılandırın:**
    - [Firebase Console](https://console.firebase.google.com/) adresine gidin ve yeni bir proje oluşturun.
    - Firebase projenize bir Android uygulaması ekleyin. Paket adı olarak `com.chathub` gibi bir isim kullanabilirsiniz.
    - Kurulum adımlarını takip ederek `google-services.json` dosyasını indirin.
    - İndirdiğiniz `google-services.json` dosyasını `mobile/android/app/` dizininin içine yerleştirin.

4.  **Ortam değişkenlerini yapılandırın:**
    `mobile/` dizininde, örnek dosyayı kopyalayarak bir `.env` dosyası oluşturun:
    ```bash
    cp .env.example .env
    ```
    Yeni `.env` dosyasını açın ve URL'leri çalışan `proxy_server` adresinizi gösterecek şekilde güncelleyin:
    - `API_BASE_URL`: Proxy sunucunuzun tam adresi (örn: `http://192.168.1.10:3000`).
    - `WEBSOCKET_URL`: Proxy sunucunuzun WebSocket adresi (örn: `ws://192.168.1.10:3001`).

5.  **Uygulamayı başlatın:**
    ```bash
    npx expo start
    ```
    Bu komut, Expo geliştirici araçlarını açacaktır. Daha sonra uygulamayı bir Android emülatöründe veya Expo Go uygulamasını kullanarak fiziksel bir cihazda çalıştırabilirsiniz.
