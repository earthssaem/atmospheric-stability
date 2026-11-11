/**
 * config.js — 미션 목표 수치 / 판정 허용 오차 (교사용 난이도 조정 상수)
 * 숫자만 바꾸면 미션 난이도가 바뀝니다. (예: 허용 오차를 키우면 더 쉬워짐)
 */
'use strict';

const TUNING = {
  tab1: {
    m2_targetH: 2.0,      // ⭐⭐ 목표 상승 응결 고도 (km)
    m2_tolH: 0.011,       // 허용 오차 (km)
    m3_fixedT: 30,        // ⭐⭐⭐ 지표 기온 (℃) — 이 값일 때만 인정
    m3_targetHeight: 4.0, // 목표 높이 (km)
    m3_tolHeight: 0.051,  // 높이 허용 오차 (km)
    m3_targetTemp: 5,     // 목표 공기 덩어리 기온 (℃)
    m3_tolTemp: 0.25      // 기온 허용 오차 (℃)
  },
  tab2: {
    m2_tolPredict: 0.5,   // ⭐⭐ 도착 기온 예측 허용 오차 (℃)
    m3_tolMax: 0.01       // ⭐⭐⭐ 최대 기온 차와의 허용 오차 (℃)
  },
  tab3: {
    m1_minThickness: 0.15, // ⭐ 층운형 구름 최소 두께 (km)
    m2_minThickness: 0.8,  // ⭐⭐ 적운형 구름 최소 두께 (km)
    m3_minThickness: 0.8   // ⭐⭐⭐ 조건부 불안정 적운형 구름 최소 두께 (km)
  },
  tab4: {
    plotTol: 0.25,         // ⭐ 점 찍기 허용 오차 (℃)
    revealAfter: 2         // 몇 번 틀리면 표의 값을 알려 줄지
  },
  tab5: {
    advMaxStart: 150       // ⭐⭐ 이류 안개가 이 거리(km, 해안 = 150 km) 안에서 시작해야 함
  },
  tab6: {
    rainGoal: 12           // ⭐ 병합설: 지표에 떨어뜨릴 빗방울 수
  }
};
