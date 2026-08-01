#!/usr/bin/env python3
"""
Comprehensive Mathematical Calculation & Immutable Ledger Test Suite for Split v2
"""

import math
import hashlib
import json

class CryptographicLedger:
    @staticmethod
    def compute_hash(group_id, event_type, ts, data, prev_hash="", source=""):
        payload = f"{group_id}:{event_type}:{ts}:{source}:{json.dumps(data, sort_keys=True)}:{prev_hash}"
        # Simulating JavaScript deterministic 12-char hex hash algorithm
        h1 = 0xdeadbeef
        h2 = 0x41c6ce57
        for ch in payload.encode('utf-8'):
            h1 = ((h1 ^ ch) * 2654435761) & 0xFFFFFFFF
            h2 = ((h2 ^ ch) * 1597334677) & 0xFFFFFFFF
        h1 = (((h1 ^ (h1 >> 16)) * 2246822507) & 0xFFFFFFFF) ^ (((h2 ^ (h2 >> 13)) * 3266489909) & 0xFFFFFFFF)
        h2 = (((h2 ^ (h2 >> 16)) * 2246822507) & 0xFFFFFFFF) ^ (((h1 ^ (h1 >> 13)) * 3266489909) & 0xFFFFFFFF)
        hex_val = f"{(4294967296 * (2097151 & h2) + h1):012x}"
        return f"0x{hex_val[:12]}"

    @staticmethod
    def validate_chain(events, group_id):
        prev_hash = ""
        for idx, evt in enumerate(events):
            source = evt.get('source', '')
            expected_hash = CryptographicLedger.compute_hash(
                group_id, evt['type'], evt['ts'], evt['data'], prev_hash, source
            )
            if evt['hash'] != expected_hash:
                return False, f"Tamper detected at step {idx}! Expected {expected_hash}, got {evt['hash']}"
            prev_hash = evt['hash']
        return True, "Chain valid"

class SettlementEngine:
    @staticmethod
    def convert_currency(amount, from_curr, to_curr, rates):
        if from_curr == to_curr:
            return round(float(amount), 2)
        from_rate = rates.get(from_curr)
        to_rate = rates.get(to_curr)
        if not from_rate or not to_rate:
            return None # Pending rate status
        converted = (float(amount) / from_rate) * to_rate
        return round(converted, 2)

    @staticmethod
    def calculate_balances(group, rates):
        members = group['members']
        group_curr = group.get('currency', 'USD')
        balances = {m: 0.0 for m in members}

        # Collect voided expense IDs
        voided_ids = set()
        for evt in group.get('events', []):
            if evt['type'] == 'STORNO_EXPENSE':
                voided_ids.add(evt['data']['expenseId'])

        # Process valid expenses
        for evt in group.get('events', []):
            if evt['type'] == 'ADD_EXPENSE':
                evt_id = evt.get('hash') or evt.get('id')
                if evt_id in voided_ids:
                    continue # Ignore voided expense

                payer = evt['data']['payer']
                orig_amt = evt['data']['originalAmount']
                orig_curr = evt['data']['originalCurrency']

                converted_amt = SettlementEngine.convert_currency(orig_amt, orig_curr, group_curr, rates)
                if converted_amt is None:
                    continue # Skip pending un-rate-resolved expenses

                split_members = evt['data'].get('splitMembers')
                if not split_members or not isinstance(split_members, list) or len(split_members) == 0:
                    split_members = members if len(members) > 0 else [payer]
                else:
                    split_members = [m for m in split_members if m in members]

                if len(split_members) == 0:
                    split_members = members if len(members) > 0 else [payer]

                num_members = len(split_members)
                # Round up each member's share to the nearest cent
                share_cents = math.ceil((converted_amt * 100) / num_members)
                total_credited = (share_cents * num_members) / 100.0

                if payer not in balances:
                    balances[payer] = 0.0
                balances[payer] += total_credited

                for m in split_members:
                    if m not in balances:
                        balances[m] = 0.0
                    balances[m] -= (share_cents / 100.0)

        # Round balances to 2 decimal places
        return {m: round(bal, 2) for m, bal in balances.items()}

    @staticmethod
    def calculate_settlements(balances):
        debtors = []
        creditors = []
        for member, bal in balances.items():
            r_bal = round(bal, 2)
            if r_bal < -0.005:
                debtors.append({'member': member, 'amount': abs(r_bal)})
            elif r_bal > 0.005:
                creditors.append({'member': member, 'amount': r_bal})

        debtors.sort(key=lambda x: x['amount'], reverse=True)
        creditors.sort(key=lambda x: x['amount'], reverse=True)

        settlements = []
        i, j = 0, 0
        while i < len(debtors) and j < len(creditors):
            debtor = debtors[i]
            creditor = creditors[j]
            amount = round(min(debtor['amount'], creditor['amount']), 2)

            if amount > 0.005:
                settlements.append({
                    'from': debtor['member'],
                    'to': creditor['member'],
                    'amount': amount
                })

            debtor['amount'] = round(debtor['amount'] - amount, 2)
            creditor['amount'] = round(creditor['amount'] - amount, 2)

            if debtor['amount'] < 0.005: i += 1
            if creditor['amount'] < 0.005: j += 1

        return settlements


def run_tests():
    rates = {'USD': 1.0, 'EUR': 0.92, 'GBP': 0.79, 'JPY': 155.0, 'CHF': 0.88}

    print("=" * 70)
    print("      SPLIT V2 MATHEMATICAL & IMMUTABLE LEDGER TEST SUITE       ")
    print("=" * 70)

    # -------------------------------------------------------------
    # TEST 1: Single Currency Equal Split Calculation
    # -------------------------------------------------------------
    print("\n[TEST 1] Single Currency Equal Split Calculation")
    g1 = {
        'id': 'grp_test1',
        'currency': 'USD',
        'members': ['Alice', 'Bob', 'Charlie'],
        'events': []
    }
    # Alice pays $90 USD
    ts1 = 1700000000
    src1 = 'dev_test1'
    h1 = CryptographicLedger.compute_hash(g1['id'], 'ADD_EXPENSE', ts1, {
        'title': 'Dinner', 'originalAmount': 90.0, 'originalCurrency': 'USD', 'payer': 'Alice'
    }, '', src1)
    g1['events'].append({
        'id': h1, 'hash': h1, 'type': 'ADD_EXPENSE', 'ts': ts1, 'source': src1,
        'data': {'title': 'Dinner', 'originalAmount': 90.0, 'originalCurrency': 'USD', 'payer': 'Alice'}
    })

    b1 = SettlementEngine.calculate_balances(g1, rates)
    s1 = SettlementEngine.calculate_settlements(b1)
    
    print(f"  Balances: {b1}")
    print(f"  Settlements: {s1}")
    assert b1['Alice'] == 60.0, f"Expected Alice = 60.0, got {b1['Alice']}"
    assert b1['Bob'] == -30.0, f"Expected Bob = -30.0, got {b1['Bob']}"
    assert b1['Charlie'] == -30.0, f"Expected Charlie = -30.0, got {b1['Charlie']}"
    assert len(s1) == 2
    assert s1[0]['amount'] == 30.0 and s1[1]['amount'] == 30.0
    print("  ✓ PASS: Equal 3-way split calculated with exact balance precision.")

    # -------------------------------------------------------------
    # TEST 2: Multi-Currency Conversion Calculation
    # -------------------------------------------------------------
    print("\n[TEST 2] Multi-Border Currency Conversion (JPY + EUR -> USD)")
    g2 = {
        'id': 'grp_test2',
        'currency': 'USD',
        'members': ['Sarah', 'Alex'],
        'events': []
    }
    # Sarah pays 15,500 JPY in Tokyo (= $100.00 USD)
    ts2_1 = 1700000100
    src2_1 = 'dev_mobile_sarah'
    h2_1 = CryptographicLedger.compute_hash(g2['id'], 'ADD_EXPENSE', ts2_1, {
        'title': 'Sushi', 'originalAmount': 15500.0, 'originalCurrency': 'JPY', 'payer': 'Sarah'
    }, '', src2_1)
    g2['events'].append({
        'id': h2_1, 'hash': h2_1, 'type': 'ADD_EXPENSE', 'ts': ts2_1, 'source': src2_1,
        'data': {'title': 'Sushi', 'originalAmount': 15500.0, 'originalCurrency': 'JPY', 'payer': 'Sarah'}
    })

    # Alex pays 46.00 EUR in Paris (= $50.00 USD)
    ts2_2 = 1700000200
    src2_2 = 'dev_web_alex'
    h2_2 = CryptographicLedger.compute_hash(g2['id'], 'ADD_EXPENSE', ts2_2, {
        'title': 'Museum', 'originalAmount': 46.0, 'originalCurrency': 'EUR', 'payer': 'Alex'
    }, h2_1, src2_2)
    g2['events'].append({
        'id': h2_2, 'hash': h2_2, 'type': 'ADD_EXPENSE', 'ts': ts2_2, 'source': src2_2,
        'data': {'title': 'Museum', 'originalAmount': 46.0, 'originalCurrency': 'EUR', 'payer': 'Alex'}
    })

    b2 = SettlementEngine.calculate_balances(g2, rates)
    s2 = SettlementEngine.calculate_settlements(b2)

    print(f"  Balances (USD): {b2}")
    print(f"  Settlements: {s2}")
    assert b2['Sarah'] == 25.0, f"Expected Sarah = 25.0, got {b2['Sarah']}"
    assert b2['Alex'] == -25.0, f"Expected Alex = -25.0, got {b2['Alex']}"
    assert len(s2) == 1
    assert s2[0]['from'] == 'Alex' and s2[0]['to'] == 'Sarah' and s2[0]['amount'] == 25.0
    print("  ✓ PASS: Multi-border currency conversion (JPY & EUR -> USD) verified accurately.")

    # -------------------------------------------------------------
    # TEST 3: Storno Immutability Test (Void expense append-only)
    # -------------------------------------------------------------
    print("\n[TEST 3] Storno Void Expense Immutability (Append-only log)")
    ts3 = 1700000300
    src3 = 'dev_mobile_sarah'
    h3 = CryptographicLedger.compute_hash(g2['id'], 'STORNO_EXPENSE', ts3, {
        'expenseId': h2_1
    }, h2_2, src3)
    g2['events'].append({
        'id': h3, 'hash': h3, 'type': 'STORNO_EXPENSE', 'ts': ts3, 'source': src3,
        'data': {'expenseId': h2_1}
    })

    b3 = SettlementEngine.calculate_balances(g2, rates)
    s3 = SettlementEngine.calculate_settlements(b3)

    print(f"  Balances after Voiding Sushi: {b3}")
    print(f"  Settlements: {s3}")
    assert b3['Alex'] == 25.0, f"Expected Alex = 25.0, got {b3['Alex']}"
    assert b3['Sarah'] == -25.0, f"Expected Sarah = -25.0, got {b3['Sarah']}"
    assert s3[0]['from'] == 'Sarah' and s3[0]['to'] == 'Alex' and s3[0]['amount'] == 25.0
    print("  ✓ PASS: Storno correctly voided expense by appending new event without altering original event.")

    # -------------------------------------------------------------
    # TEST 4: Cryptographic Ledger Chain Integrity & Tamper Detection
    # -------------------------------------------------------------
    print("\n[TEST 4] Cryptographic Hash Chain Validation & Tamper Detection")
    valid, msg = CryptographicLedger.validate_chain(g2['events'], g2['id'])
    assert valid is True, f"Chain should be valid: {msg}"
    print("  ✓ PASS: Cryptographic event hash chain validation succeeded.")

    # Attempt Tampering: Change original JPY amount in past event
    tampered_events = [json.loads(json.dumps(e)) for e in g2['events']]
    tampered_events[0]['data']['originalAmount'] = 99999.0

    tamper_valid, tamper_msg = CryptographicLedger.validate_chain(tampered_events, g2['id'])
    assert tamper_valid is False, "Tampered chain MUST fail validation"
    print(f"  ✓ PASS: Tamper detected successfully! ({tamper_msg})")

    # -------------------------------------------------------------
    # TEST 5: Floating Point Precision & Net Zero Balance Balance Check
    # -------------------------------------------------------------
    print("\n[TEST 5] Floating Point Precision & Net-Zero Balance Verification")
    g5 = {
        'id': 'grp_test5',
        'currency': 'USD',
        'members': ['A', 'B', 'C'],
        'events': []
    }
    src5 = 'dev_test5'
    h5 = CryptographicLedger.compute_hash(g5['id'], 'ADD_EXPENSE', 1700000500, {
        'title': 'Shared Item', 'originalAmount': 100.0, 'originalCurrency': 'USD', 'payer': 'A'
    }, '', src5)
    g5['events'].append({
        'id': h5, 'hash': h5, 'type': 'ADD_EXPENSE', 'ts': 1700000500, 'source': src5,
        'data': {'title': 'Shared Item', 'originalAmount': 100.0, 'originalCurrency': 'USD', 'payer': 'A'}
    })

    b5 = SettlementEngine.calculate_balances(g5, rates)
    sum_b5 = round(sum(b5.values()), 2)
    assert sum_b5 == 0.0, f"Sum of balances MUST equal 0.00, got {sum_b5}"
    print(f"  Balances: {b5}")
    print(f"  Sum of all balances = {sum_b5}")
    print("  ✓ PASS: Floating point precision verified; net total balance equals 0.00.")

    # -------------------------------------------------------------
    # TEST 6: Subgroup Split Calculation
    # -------------------------------------------------------------
    print("\n[TEST 6] Subgroup Split Calculation (Selected Members Only)")
    g6 = {
        'id': 'grp_test6',
        'currency': 'USD',
        'members': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
        'events': []
    }
    # Alice pays $90 USD for Taxi, shared ONLY by Alice, Bob, Charlie (David & Eve excluded)
    ts6 = 1700000600
    src6 = 'dev_test6'
    h6 = CryptographicLedger.compute_hash(g6['id'], 'ADD_EXPENSE', ts6, {
        'title': 'Taxi to Beach', 'originalAmount': 90.0, 'originalCurrency': 'USD', 'payer': 'Alice',
        'splitMembers': ['Alice', 'Bob', 'Charlie']
    }, '', src6)
    g6['events'].append({
        'id': h6, 'hash': h6, 'type': 'ADD_EXPENSE', 'ts': ts6, 'source': src6,
        'data': {'title': 'Taxi to Beach', 'originalAmount': 90.0, 'originalCurrency': 'USD', 'payer': 'Alice', 'splitMembers': ['Alice', 'Bob', 'Charlie']}
    })

    b6 = SettlementEngine.calculate_balances(g6, rates)
    s6 = SettlementEngine.calculate_settlements(b6)
    sum_b6 = round(sum(b6.values()), 2)

    print(f"  Balances: {b6}")
    print(f"  Settlements: {s6}")
    assert b6['Alice'] == 60.0, f"Expected Alice = 60.0, got {b6['Alice']}"
    assert b6['Bob'] == -30.0, f"Expected Bob = -30.0, got {b6['Bob']}"
    assert b6['Charlie'] == -30.0, f"Expected Charlie = -30.0, got {b6['Charlie']}"
    assert b6['David'] == 0.0, f"Expected David = 0.0, got {b6['David']}"
    assert b6['Eve'] == 0.0, f"Expected Eve = 0.0, got {b6['Eve']}"
    assert sum_b6 == 0.0, f"Sum of balances MUST equal 0.00, got {sum_b6}"
    print("  ✓ PASS: Subgroup split verified accurately (David & Eve zero balance).")

    # -------------------------------------------------------------
    # TEST 7: Historical Exchange Rate Conversion
    # -------------------------------------------------------------
    print("\n[TEST 7] Historical Exchange Rate Conversion (Past Date)")
    hist_rates = {'USD': 1.0, 'EUR': 0.85} # Historical rate from 3 months ago (1 EUR = 1.176 USD)
    g7 = {
        'id': 'grp_test7',
        'currency': 'USD',
        'members': ['Alice', 'Bob'],
        'events': []
    }
    ts7 = 1700000700
    src7 = 'dev_test7'
    h7 = CryptographicLedger.compute_hash(g7['id'], 'ADD_EXPENSE', ts7, {
        'title': 'Prepaid Course', 'originalAmount': 100.0, 'originalCurrency': 'EUR', 'payer': 'Alice',
        'expenseDate': '2026-04-15'
    }, '', src7)
    g7['events'].append({
        'id': h7, 'hash': h7, 'type': 'ADD_EXPENSE', 'ts': ts7, 'source': src7,
        'data': {'title': 'Prepaid Course', 'originalAmount': 100.0, 'originalCurrency': 'EUR', 'payer': 'Alice', 'expenseDate': '2026-04-15'}
    })

    b7 = SettlementEngine.calculate_balances(g7, hist_rates)
    print(f"  Balances (USD with historical rate): {b7}")
    assert b7['Alice'] == 58.83, f"Expected Alice = 58.83, got {b7['Alice']}"
    assert b7['Bob'] == -58.83, f"Expected Bob = -58.83, got {b7['Bob']}"
    print("  ✓ PASS: Historical exchange rate conversion for past date verified accurately.")

    # -------------------------------------------------------------
    # TEST 8: Uneven Penny Remainder Distribution & Net-Zero
    # -------------------------------------------------------------
    print("\n[TEST 8] Uneven Penny Remainder Distribution ($10 ÷ 3)")
    g8 = {
        'id': 'grp_test8',
        'currency': 'USD',
        'members': ['X', 'Y', 'Z'],
        'events': []
    }
    src8 = 'dev_test8'
    h8 = CryptographicLedger.compute_hash(g8['id'], 'ADD_EXPENSE', 1700000800, {
        'title': 'Snack', 'originalAmount': 10.0, 'originalCurrency': 'USD', 'payer': 'X'
    }, '', src8)
    g8['events'].append({
        'id': h8, 'hash': h8, 'type': 'ADD_EXPENSE', 'ts': 1700000800, 'source': src8,
        'data': {'title': 'Snack', 'originalAmount': 10.0, 'originalCurrency': 'USD', 'payer': 'X'}
    })

    b8 = SettlementEngine.calculate_balances(g8, rates)
    sum_b8 = round(sum(b8.values()), 2)
    print(f"  Balances: {b8}")
    # $10 / 3 = 3.3333333333333335 -> ceil is 3.34
    assert b8['X'] == 6.68, f"Expected X = 6.68, got {b8['X']}"
    assert b8['Y'] == -3.34, f"Expected Y = -3.34, got {b8['Y']}"
    assert b8['Z'] == -3.34, f"Expected Z = -3.34, got {b8['Z']}"
    assert sum_b8 == 0.0, f"Net-zero violated! Sum = {sum_b8}"
    print("  ✓ PASS: Penny remainder distributed correctly; net-zero maintained.")

    # -------------------------------------------------------------
    # TEST 9: Storno + Subgroup Interaction
    # -------------------------------------------------------------
    print("\n[TEST 9] Storno Void on Subgroup Expense")
    g9 = {
        'id': 'grp_test9',
        'currency': 'USD',
        'members': ['Alice', 'Bob', 'Charlie'],
        'events': []
    }
    src9 = 'dev_test9'
    # Alice pays $60 split between Alice & Bob only (Charlie excluded)
    h9_1 = CryptographicLedger.compute_hash(g9['id'], 'ADD_EXPENSE', 1700000900, {
        'title': 'Private Dinner', 'originalAmount': 60.0, 'originalCurrency': 'USD',
        'payer': 'Alice', 'splitMembers': ['Alice', 'Bob']
    }, '', src9)
    g9['events'].append({
        'id': h9_1, 'hash': h9_1, 'type': 'ADD_EXPENSE', 'ts': 1700000900, 'source': src9,
        'data': {'title': 'Private Dinner', 'originalAmount': 60.0, 'originalCurrency': 'USD',
                 'payer': 'Alice', 'splitMembers': ['Alice', 'Bob']}
    })

    b9_before = SettlementEngine.calculate_balances(g9, rates)
    assert b9_before['Alice'] == 30.0, f"Pre-storno: Expected Alice = 30.0, got {b9_before['Alice']}"
    assert b9_before['Bob'] == -30.0, f"Pre-storno: Expected Bob = -30.0, got {b9_before['Bob']}"
    assert b9_before['Charlie'] == 0.0, f"Pre-storno: Expected Charlie = 0.0, got {b9_before['Charlie']}"

    # Void the subgroup expense
    h9_2 = CryptographicLedger.compute_hash(g9['id'], 'STORNO_EXPENSE', 1700001000, {
        'expenseId': h9_1
    }, h9_1, src9)
    g9['events'].append({
        'id': h9_2, 'hash': h9_2, 'type': 'STORNO_EXPENSE', 'ts': 1700001000, 'source': src9,
        'data': {'expenseId': h9_1}
    })

    b9_after = SettlementEngine.calculate_balances(g9, rates)
    print(f"  Balances after storno: {b9_after}")
    assert b9_after['Alice'] == 0.0, f"Post-storno: Expected Alice = 0.0, got {b9_after['Alice']}"
    assert b9_after['Bob'] == 0.0, f"Post-storno: Expected Bob = 0.0, got {b9_after['Bob']}"
    assert b9_after['Charlie'] == 0.0, f"Post-storno: Expected Charlie = 0.0, got {b9_after['Charlie']}"
    print("  ✓ PASS: Voiding subgroup expense correctly zeroes all balances; non-participants unaffected.")

    # -------------------------------------------------------------
    # TEST 10: Single Member Group Edge Case
    # -------------------------------------------------------------
    print("\n[TEST 10] Single Member Group (Solo Payer)")
    g10 = {
        'id': 'grp_test10',
        'currency': 'USD',
        'members': ['Solo'],
        'events': []
    }
    src10 = 'dev_test10'
    h10 = CryptographicLedger.compute_hash(g10['id'], 'ADD_EXPENSE', 1700001100, {
        'title': 'Self Treat', 'originalAmount': 50.0, 'originalCurrency': 'USD', 'payer': 'Solo'
    }, '', src10)
    g10['events'].append({
        'id': h10, 'hash': h10, 'type': 'ADD_EXPENSE', 'ts': 1700001100, 'source': src10,
        'data': {'title': 'Self Treat', 'originalAmount': 50.0, 'originalCurrency': 'USD', 'payer': 'Solo'}
    })

    b10 = SettlementEngine.calculate_balances(g10, rates)
    s10 = SettlementEngine.calculate_settlements(b10)
    print(f"  Balances: {b10}")
    print(f"  Settlements: {s10}")
    assert b10['Solo'] == 0.0, f"Expected Solo = 0.0, got {b10['Solo']}"
    assert len(s10) == 0, f"Expected 0 settlements, got {len(s10)}"
    print("  ✓ PASS: Single member pays and owes themselves → balance = $0, no settlements.")

    # -------------------------------------------------------------
    # TEST 11: Multiple Payers with Settlement Minimization
    # -------------------------------------------------------------
    print("\n[TEST 11] Multiple Payers Settlement Minimization (4 members, 3 expenses)")
    g11 = {
        'id': 'grp_test11',
        'currency': 'USD',
        'members': ['Alice', 'Bob', 'Charlie', 'Diana'],
        'events': []
    }
    src11 = 'dev_test11'
    prev_hash = ''
    # Alice pays $100 (split 4 ways: each owes $25)
    h11_1 = CryptographicLedger.compute_hash(g11['id'], 'ADD_EXPENSE', 1700001200, {
        'title': 'Hotel', 'originalAmount': 100.0, 'originalCurrency': 'USD', 'payer': 'Alice'
    }, prev_hash, src11)
    g11['events'].append({
        'id': h11_1, 'hash': h11_1, 'type': 'ADD_EXPENSE', 'ts': 1700001200, 'source': src11,
        'data': {'title': 'Hotel', 'originalAmount': 100.0, 'originalCurrency': 'USD', 'payer': 'Alice'}
    })
    prev_hash = h11_1

    # Bob pays $40 (split 4 ways: each owes $10)
    h11_2 = CryptographicLedger.compute_hash(g11['id'], 'ADD_EXPENSE', 1700001300, {
        'title': 'Groceries', 'originalAmount': 40.0, 'originalCurrency': 'USD', 'payer': 'Bob'
    }, prev_hash, src11)
    g11['events'].append({
        'id': h11_2, 'hash': h11_2, 'type': 'ADD_EXPENSE', 'ts': 1700001300, 'source': src11,
        'data': {'title': 'Groceries', 'originalAmount': 40.0, 'originalCurrency': 'USD', 'payer': 'Bob'}
    })
    prev_hash = h11_2

    # Charlie pays $20 (split 4 ways: each owes $5)
    h11_3 = CryptographicLedger.compute_hash(g11['id'], 'ADD_EXPENSE', 1700001400, {
        'title': 'Taxi', 'originalAmount': 20.0, 'originalCurrency': 'USD', 'payer': 'Charlie'
    }, prev_hash, src11)
    g11['events'].append({
        'id': h11_3, 'hash': h11_3, 'type': 'ADD_EXPENSE', 'ts': 1700001400, 'source': src11,
        'data': {'title': 'Taxi', 'originalAmount': 20.0, 'originalCurrency': 'USD', 'payer': 'Charlie'}
    })

    b11 = SettlementEngine.calculate_balances(g11, rates)
    s11 = SettlementEngine.calculate_settlements(b11)
    sum_b11 = round(sum(b11.values()), 2)
    print(f"  Balances: {b11}")
    print(f"  Settlements: {s11}")
    # Alice: paid 100, owes 40 (25+10+5) → net +60
    # Bob: paid 40, owes 40 → net 0
    # Charlie: paid 20, owes 40 → net -20
    # Diana: paid 0, owes 40 → net -40
    assert b11['Alice'] == 60.0, f"Expected Alice = 60.0, got {b11['Alice']}"
    assert b11['Bob'] == 0.0, f"Expected Bob = 0.0, got {b11['Bob']}"
    assert b11['Charlie'] == -20.0, f"Expected Charlie = -20.0, got {b11['Charlie']}"
    assert b11['Diana'] == -40.0, f"Expected Diana = -40.0, got {b11['Diana']}"
    assert sum_b11 == 0.0, f"Net-zero violated! Sum = {sum_b11}"
    # Settlement should be: Diana → Alice $40, Charlie → Alice $20 (2 transfers, not 3)
    assert len(s11) == 2, f"Expected 2 settlements (minimized), got {len(s11)}"
    total_settled = sum(s['amount'] for s in s11)
    assert total_settled == 60.0, f"Expected total settled = 60.0, got {total_settled}"
    print("  ✓ PASS: Multiple payers balanced correctly; settlement minimized to 2 transfers.")

    # -------------------------------------------------------------
    # TEST 12: Settle-Up (All Expenses Voided → Zero Balances)
    # -------------------------------------------------------------
    print("\n[TEST 12] Settle-Up Full Void Verification")
    g12 = {
        'id': 'grp_test12',
        'currency': 'EUR',
        'members': ['Max', 'Lena'],
        'events': []
    }
    src12 = 'dev_test12'
    prev_hash12 = ''
    # Max pays €30
    h12_1 = CryptographicLedger.compute_hash(g12['id'], 'ADD_EXPENSE', 1700001500, {
        'title': 'Lunch', 'originalAmount': 30.0, 'originalCurrency': 'EUR', 'payer': 'Max'
    }, prev_hash12, src12)
    g12['events'].append({
        'id': h12_1, 'hash': h12_1, 'type': 'ADD_EXPENSE', 'ts': 1700001500, 'source': src12,
        'data': {'title': 'Lunch', 'originalAmount': 30.0, 'originalCurrency': 'EUR', 'payer': 'Max'}
    })
    prev_hash12 = h12_1

    # Lena pays €50
    h12_2 = CryptographicLedger.compute_hash(g12['id'], 'ADD_EXPENSE', 1700001600, {
        'title': 'Tickets', 'originalAmount': 50.0, 'originalCurrency': 'EUR', 'payer': 'Lena'
    }, prev_hash12, src12)
    g12['events'].append({
        'id': h12_2, 'hash': h12_2, 'type': 'ADD_EXPENSE', 'ts': 1700001600, 'source': src12,
        'data': {'title': 'Tickets', 'originalAmount': 50.0, 'originalCurrency': 'EUR', 'payer': 'Lena'}
    })
    prev_hash12 = h12_2

    # Verify pre-settle balances
    b12_pre = SettlementEngine.calculate_balances(g12, rates)
    assert b12_pre['Max'] != 0.0 or b12_pre['Lena'] != 0.0, "Pre-settle should have non-zero balances"

    # Settle up: void both expenses
    h12_s1 = CryptographicLedger.compute_hash(g12['id'], 'STORNO_EXPENSE', 1700001700, {
        'expenseId': h12_1
    }, prev_hash12, src12)
    g12['events'].append({
        'id': h12_s1, 'hash': h12_s1, 'type': 'STORNO_EXPENSE', 'ts': 1700001700, 'source': src12,
        'data': {'expenseId': h12_1}
    })
    prev_hash12 = h12_s1

    h12_s2 = CryptographicLedger.compute_hash(g12['id'], 'STORNO_EXPENSE', 1700001800, {
        'expenseId': h12_2
    }, prev_hash12, src12)
    g12['events'].append({
        'id': h12_s2, 'hash': h12_s2, 'type': 'STORNO_EXPENSE', 'ts': 1700001800, 'source': src12,
        'data': {'expenseId': h12_2}
    })

    b12_post = SettlementEngine.calculate_balances(g12, rates)
    s12_post = SettlementEngine.calculate_settlements(b12_post)
    print(f"  Pre-settle balances: {b12_pre}")
    print(f"  Post-settle balances: {b12_post}")
    assert b12_post['Max'] == 0.0, f"Expected Max = 0.0 after settle, got {b12_post['Max']}"
    assert b12_post['Lena'] == 0.0, f"Expected Lena = 0.0 after settle, got {b12_post['Lena']}"
    assert len(s12_post) == 0, f"Expected 0 settlements after settle, got {len(s12_post)}"
    print("  ✓ PASS: Settling up (voiding all expenses) correctly zeroes all balances.")

    print("\n" + "=" * 70)
    print("      ALL MATHEMATICAL & IMMUTABILITY TESTS PASSED!      ")
    print("=" * 70)


if __name__ == '__main__':
    run_tests()
