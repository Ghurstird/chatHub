import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { app } from './server.mjs';




let accessToken;
let userId;
let roomId;

describe('Server API Tests', () => {
  describe('Login API Test', () => {
    describe('/login', () => {
      it('başarısız login olduğunda 401 dönmeli', async () => {
        const response = await request(app)
          .post('/login')
          .send({ username: 'invalid', password: 'wrong' });
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });
    });

    it('Doğru bilgiler ile login başarılı olmalı', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'tan', password: '123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('accessToken');

      // ✅ Değerleri kaydet
      userId = res.body.userId;
      accessToken = res.body.accessToken;
    });
  });

  describe('/register', () => {
    it('eksik veri ile register başarısız olmalı', async () => {
      const response = await request(app)
        .post('/register')
        .send({ username: 'useronly' });
      expect(response.status).toBe(400);
    });
  });

  describe('Register API Test', () => {
    it('eksiksiz bilgilerle register işlemi başarılı olmalı', async () => {
      const randomSuffix = Math.floor(Math.random() * 100000);
      const username = `testuser_${randomSuffix}`;
      const password = '123';

      const res = await request(app)
        .post('/register')
        .send({ username, password });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('deviceId');
    });
  });

  

  describe('/rooms/:userId', () => {
    it('doğru token ile oda listesi başarılı alınmalı', async () => {
      const res = await request(app)
        .get(`/rooms/${userId}`)
        .query({ accessToken });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      // ✅ İlk odayı kaydet
      roomId = res.body[0].roomId;
    });
  });

  describe('/messages/:roomId', () => {
    it('doğru bilgilerle mesajlar alınmalı', async () => {
      const res = await request(app)
        .get(`/messages/${roomId}`)
        .query({ userId, accessToken });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

  });

  describe('/sendMessage', () => {
    it('hatalı oda ile mesaj gönderimi başarısız olmalı', async () => {
      const res = await request(app)
        .post('/sendMessage')
        .send({
          userId,
          roomId: '!gecersiz:matrix.local',
          text: 'Hatalı mesaj',
          msgtype: 'm.text',
        });
      expect(res.status).not.toBe(200);
    });

    it('doğru bilgilerle mesaj gönderimi başarılı olmalı', async () => {
      const res = await request(app)
        .post('/sendMessage')
        .send({
          userId,
          roomId,
          text: 'Jest test mesajı',
          msgtype: 'm.text',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('text', 'Jest test mesajı');
    });
    
  });
});
