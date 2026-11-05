const { resume } = require('../src/modules/audit/audit.service');

describe('journal d\'audit : résumé lisible', () => {
  test('modification : seuls les champs changés, sans secrets', () => {
    const r = resume({ action: 'UPDATE',
      ancienne: { id: 1, role: 'RESPONSABLE_POLE', actif: true, totp_secret: 'SECRET', mot_de_passe_hash: 'h' },
      nouvelle: { id: 1, role: 'CONTROLE_GESTION', actif: true, totp_secret: 'AUTRE', mot_de_passe_hash: 'h2' } });
    expect(r).toEqual([{ champ: 'role', avant: 'RESPONSABLE_POLE', apres: 'CONTROLE_GESTION' }]);
  });
  test('ajout : premiers champs renseignés, sans secret ni identifiant', () => {
    const r = resume({ action: 'INSERT', ancienne: null, nouvelle: { id: 'x', code: 'BPO-01', intitule: null, empreinte_cle: 'zzz' } });
    expect(r).toEqual([{ champ: 'code', avant: null, apres: 'BPO-01' }]);
  });
  test('suppression : valeurs précédentes', () => {
    const r = resume({ action: 'DELETE', ancienne: { id: 'x', code: 'A' }, nouvelle: null });
    expect(r).toEqual([{ champ: 'code', avant: 'A', apres: null }]);
  });
  test('valeur très longue tronquée', () => {
    const r = resume({ action: 'UPDATE', ancienne: { t: 'a' }, nouvelle: { t: 'b'.repeat(300) } });
    expect(r[0].apres.length).toBe(118);
  });
});
