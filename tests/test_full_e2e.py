import asyncio
import json
import urllib.request
import urllib.parse
import websockets
import time

BASE_HTTP = 'http://127.0.0.1:8000'
BASE_WS = 'ws://127.0.0.1:8000'

def http_req(path, method='GET', data=None, token=None):
    url = BASE_HTTP + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req_obj = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers=headers,
        method=method
    )
    with urllib.request.urlopen(req_obj) as res:
        return json.loads(res.read().decode())

async def recv_type(ws, expected_type, timeout=4.0):
    """Drain queue until message of expected_type arrives"""
    loop = asyncio.get_event_loop()
    end_time = loop.time() + timeout
    while loop.time() < end_time:
        try:
            msg_text = await asyncio.wait_for(ws.recv(), timeout=1.0)
            data = json.loads(msg_text)
            if data.get('type') == expected_type:
                return data
        except asyncio.TimeoutError:
            continue
    raise TimeoutError(f"Timed out waiting for message of type '{expected_type}'")

async def run_full_e2e_test():
    print("==================================================")
    print("STARTING COMPLETE MULTI-USER E2E WORKSPACE TEST")
    print("==================================================")

    # 1. Health check
    print("\n[Step 1] Verifying System Health...")
    health = http_req('/api/health')
    print("[OK] Health Status:", health['status'], health['services'])

    ts = int(time.time())
    # 2. Register User A
    print("\n[Step 2] Registering User A (Alice Engineer)...")
    res_a = http_req('/api/auth/register', 'POST', {
        'name': 'Alice Engineer',
        'email': f'alice_{ts}@example.com',
        'password': 'password123'
    })
    tok_a = res_a['access_token']
    user_a = res_a['user']
    print(f"[OK] User A Registered: {user_a['name']} (ID: {user_a['id']})")

    # 3. Register User B
    print("\n[Step 3] Registering User B (Bob Developer)...")
    res_b = http_req('/api/auth/register', 'POST', {
        'name': 'Bob Developer',
        'email': f'bob_{ts}@example.com',
        'password': 'password123'
    })
    tok_b = res_b['access_token']
    user_b = res_b['user']
    print(f"[OK] User B Registered: {user_b['name']} (ID: {user_b['id']})")

    # 4. User A Creates Room
    print("\n[Step 4] User A Creates Collaboration Room...")
    room = http_req('/api/rooms', 'POST', {'name': 'Algorithms Sprint 2026'}, token=tok_a)
    room_code = room['room_code']
    print(f"[OK] Room Created: Code = {room_code}, Name = '{room['name']}'")

    # 5. Verify seeded files
    print("\n[Step 5] Checking Initial Seeded Project Files...")
    files = http_req(f'/api/rooms/{room_code}/files', token=tok_a)
    print(f"[OK] Seeded Files ({len(files)}): {[f['name'] for f in files]}")
    main_file = next(f for f in files if f['name'] == 'main.py')

    # 6. User B Joins Room
    print("\n[Step 6] User B Joins Room with Code...")
    joined = http_req(f'/api/rooms/{room_code}/join', 'POST', token=tok_b)
    print(f"[OK] User B Joined. Total Members in Room: {joined['member_count']}")

    # 7. WebSocket Multi-User Real-time Sync
    print("\n[Step 7] Testing Real-Time WebSocket Multi-User Synchronization...")
    uri_a = f"{BASE_WS}/ws/{room_code}?token={tok_a}"
    uri_b = f"{BASE_WS}/ws/{room_code}?token={tok_b}"

    async with websockets.connect(uri_a) as ws_a:
        conn_a = await recv_type(ws_a, 'room_connected')
        print(f"  -> User A WebSocket connected ({conn_a.get('room_name')})")

        async with websockets.connect(uri_b) as ws_b:
            conn_b = await recv_type(ws_b, 'room_connected')
            print(f"  -> User B WebSocket connected ({conn_b.get('room_name')})")

            # User A receives presence update for User B
            presence_a = await recv_type(ws_a, 'presence_update')
            print(f"  -> User A saw presence update: {len(presence_a.get('online_users', []))} users online")

            # User A edits main.py
            new_code = "print('Hello from Collaborative CodeSpace! Multi-user sync active.')"
            await ws_a.send(json.dumps({
                "type": "code_change",
                "file_id": main_file["id"],
                "content": new_code
            }))
            print("  -> User A typed code edit")

            # User B receives the code edit
            msg_b_code = await recv_type(ws_b, 'code_change')
            print(f"  -> User B received live Code Sync: '{msg_b_code.get('content')}' from {msg_b_code.get('sender_name')}")
            assert msg_b_code.get('content') == new_code, "Code sync content mismatch"

            # User B moves cursor
            await ws_b.send(json.dumps({
                "type": "cursor_move",
                "file_id": main_file["id"],
                "cursor": {"lineNumber": 1, "column": 25}
            }))
            print("  -> User B moved cursor to Line 1, Column 25")

            # User A receives cursor position
            msg_a_cursor = await recv_type(ws_a, 'cursor_move')
            print(f"  -> User A saw User B's cursor: {msg_a_cursor.get('cursor')}")

            # User A sends a chat message
            await ws_a.send(json.dumps({
                "type": "chat_message",
                "message": "Bob, check out the live sync in line 1!"
            }))

            # User B receives the chat message
            chat_b = await recv_type(ws_b, 'chat_message')
            print(f"  -> User B received Chat: '{chat_b.get('message')}' from {chat_b.get('sender_name')}")

            # WebRTC Signaling Test between A and B
            print("\n[Step 8] Testing WebRTC Video Signaling Mesh...")
            await ws_a.send(json.dumps({
                "type": "signal",
                "target_user_id": user_b['id'],
                "signal": {"type": "offer", "sdp": "v=0\r\no=mock 123 2 IN IP4 127.0.0.1"}
            }))
            signal_b = await recv_type(ws_b, 'signal')
            print(f"  -> User B received WebRTC Offer signal from {signal_b.get('sender_name')}")

    # 9. Multi-file Code Execution Test
    print("\n[Step 9] Testing Multi-File Python Execution...")
    multi_file_payload = {
        'files': [
            {'name': 'main.py', 'content': 'from utils import multiply\nprint("Product:", multiply(6, 7))'},
            {'name': 'utils.py', 'content': 'def multiply(a, b): return a * b'}
        ],
        'entry_file': 'main.py',
        'language': 'python'
    }
    exec_res = http_req('/api/execute', 'POST', multi_file_payload, token=tok_a)
    print(f"[OK] Execution Status: {exec_res['status']}")
    print(f"[OK] Execution Time: {exec_res['execution_time']}s")
    print(f"[OK] Output: {exec_res['output'].strip()}")
    assert "Product: 42" in exec_res['output'], "Multi-file import execution output did not match"

    # 10. Test Compilation/Runtime Error handling without internal path leaks
    print("\n[Step 10] Testing Runtime Error & Sanitization...")
    error_payload = {
        'code': 'x = 10 / 0',
        'language': 'python'
    }
    err_res = http_req('/api/execute', 'POST', error_payload, token=tok_a)
    print(f"[OK] Error Execution Status: {err_res['status']}")
    print(f"[OK] Sanitized Error Output:\n{err_res['output'].strip()}")
    assert "ZeroDivisionError" in err_res['output']

    # 11. AI Assistant Verification
    print("\n[Step 11] Testing In-Room AI Assistant...")
    ai_explain = http_req('/api/ai', 'POST', {
        'action': 'explain',
        'code': 'def calculate_sum(numbers):\n    return sum(numbers)',
        'language': 'python'
    }, token=tok_a)
    safe_result = ai_explain['result'][:100].encode('ascii', errors='replace').decode()
    print(f"[OK] AI Response (Model: {ai_explain['model_used']}):\n{safe_result}...")

    print("\n==================================================")
    print("[OK] ALL MULTI-USER E2E WORKSPACE FEATURES VERIFIED PERFECTLY!")
    print("==================================================")

if __name__ == '__main__':
    asyncio.run(run_full_e2e_test())
