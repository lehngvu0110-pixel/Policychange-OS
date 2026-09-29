const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../js/policy-ledger.js');

function sample() {
  const ledger = [];
  for (let i = 0; i < 4; i++) {
    Ledger.append(ledger, { ts: '2026-09-29T00:00:0' + i + 'Z', actor: 'AI', docId: 'D', lineIndex: i, action: 'PATCH dòng ' + (i + 1), from: 'a' + i, to: 'b' + i, basis: 'x', propId: 'P' + i });
  }
  return ledger;
}

test('chuỗi hợp lệ khi chưa bị đụng tới, bắt đầu từ băm gốc', () => {
  const ledger = sample();
  assert.equal(ledger[0].prevHash, Ledger.GENESIS);
  assert.equal(Ledger.verify(ledger), true);
  assert.deepEqual(Ledger.tailOf(ledger), { seq: 4, hash: ledger[3].hash });
});

test('sửa lén bất kỳ trường nào của một bản ghi giữa chuỗi đều bị phát hiện', () => {
  for (const field of ['ts', 'actor', 'docId', 'action', 'from', 'to', 'basis', 'propId']) {
    const ledger = sample();
    ledger[1][field] = ledger[1][field] + '!';
    assert.equal(Ledger.verify(ledger), false, field);
  }
  const reordered = sample();
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.equal(Ledger.verify(reordered), false);
  const truncatedFront = sample().slice(1);
  assert.equal(Ledger.verify(truncatedFront), false);
});

test('createRecord từ một đuôi chuỗi cho ra đúng bản ghi mà append sinh ra', () => {
  const ledger = sample();
  const entry = { ts: 't', actor: 'Người', docId: 'D', lineIndex: 0, action: 'HOÀN TÁC bản ghi #1', from: 'b0', to: 'a0', basis: 'undo', propId: 'P0', revertsSeq: 1 };
  const fromTail = Ledger.createRecord(Ledger.tailOf(ledger), entry);
  const appended = Ledger.append(ledger, entry);
  assert.deepEqual(fromTail, appended);
  assert.equal(Ledger.isReverted(ledger, 1), true);
  assert.equal(Ledger.isReverted(ledger, 2), false);
});
