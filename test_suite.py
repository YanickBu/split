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

                if payer not in balances:
                    balances[payer] = 0.0
                balances[payer] += converted_amt

                split_members = evt['data'].get('splitMembers')
                if not split_members or not isinstance(split_members, list) or len(split_members) == 0:
                    split_members = members if len(members) > 0 else [payer]
                else:
                    split_members = [m for m in split_members if m in members]

                if len(split_members) == 0:
                    split_members = members if len(members) > 0 else [payer]

                num_members = len(split_members)
                base_share_cents = int((converted_amt * 100) // num_members)
                remainder_cents = int(round((converted_amt * 100) - (base_share_cents * num_members)))

                for m in split_members:
                    if m not in balances:
                        balances[m] = 0.0
                    member_cents = base_share_cents
                    if remainder_cents > 0:
                        member_cents += 1
                        remainder_cents -= 1
                    balances[m] -= (member_cents / 100.0)

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

    print("\n" + "=" * 70)
    print("      ALL MATHEMATICAL & IMMUTABILITY TESTS PASSED!      ")
    print("=" * 70)


if __name__ == '__main__':
    run_tests()
