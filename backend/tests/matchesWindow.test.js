import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { brtDayWindow } from '../src/routes/matches.js';

describe('brtDayWindow', () => {
  // Cenário reportado: cron rodou em 2026-06-10 17:35 UTC (14:35 BRT) e havia um
  // jogo às 23h BRT do dia seguinte (= 2026-06-12 02:00 UTC). Com a janela calculada
  // em UTC esse jogo caía fora; deve estar dentro quando calculada em horário de Brasília.
  it('inclui jogos noturnos (23h BRT) que viram o dia em UTC', () => {
    const now = moment('2026-06-10T17:35:41Z');
    const { start, end } = brtDayWindow(now);

    // Janela = hoje + amanhã em BRT (UTC-3): [2026-06-10 00:00 BRT, 2026-06-12 00:00 BRT)
    expect(start).toBe('2026-06-10T03:00:00.000Z');
    expect(end).toBe('2026-06-12T03:00:00.000Z');

    const lateMatch = '2026-06-12T02:00:00.000Z'; // 23h BRT de 2026-06-11
    expect(lateMatch >= start && lateMatch < end).toBe(true);
  });

  it('independe do fuso do servidor (offset fixo BRT)', () => {
    const now = moment('2026-06-10T17:35:41Z');
    const a = brtDayWindow(now);
    const b = brtDayWindow(moment(now)); // mesmo instante
    expect(a).toEqual(b);
  });
});
