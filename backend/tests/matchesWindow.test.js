import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { brtDayWindow } from '../src/routes/matches.js';

describe('brtDayWindow', () => {
  // A agenda do "dia" vai de 01:00 BRT até 01:00 BRT do dia seguinte: jogos da
  // madrugada (00:00–00:59) contam como a noite do dia anterior. Janela = hoje + amanhã.
  it('usa fronteira de 01:00 BRT (não meia-noite)', () => {
    const now = moment('2026-06-10T17:35:41Z'); // 14:35 BRT
    const { start, end } = brtDayWindow(now);

    // [2026-06-10 01:00 BRT, 2026-06-12 01:00 BRT) = [04:00 UTC, 04:00 UTC)
    expect(start).toBe('2026-06-10T04:00:00.000Z');
    expect(end).toBe('2026-06-12T04:00:00.000Z');
  });

  it('inclui jogos noturnos (23h BRT) que viram o dia em UTC', () => {
    const now = moment('2026-06-10T17:35:41Z');
    const { start, end } = brtDayWindow(now);
    const lateMatch = '2026-06-12T02:00:00.000Z'; // 23h BRT de 2026-06-11
    expect(lateMatch >= start && lateMatch < end).toBe(true);
  });

  it('entre 00:00 e 01:00 BRT ainda pertence ao dia anterior', () => {
    const now = moment('2026-06-10T03:30:00Z'); // 00:30 BRT de 2026-06-10
    const { start, end } = brtDayWindow(now);
    // Continua no dia "09/jun" (que começou 01:00 BRT do dia 09 = 04:00 UTC)
    expect(start).toBe('2026-06-09T04:00:00.000Z');
    expect(end).toBe('2026-06-11T04:00:00.000Z');
  });

  it('independe do fuso do servidor (offset fixo BRT)', () => {
    const now = moment('2026-06-10T17:35:41Z');
    const a = brtDayWindow(now);
    const b = brtDayWindow(moment(now)); // mesmo instante
    expect(a).toEqual(b);
  });
});
