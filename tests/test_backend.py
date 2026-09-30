import urllib.request
import urllib.parse
import json

BASE = 'http://127.0.0.1:8000'

def req(path, method='GET', data=None, token=None):
    url = BASE + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data_bytes = json.dumps(data).encode() if data else None
    req_obj = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req_obj) as res:
        return json.loads(res.read().decode())

def main():
    print("1. Checking Health...")
    health = req('/api/health')
    print("Health:", health)

    import time
    ts = int(time.time())
    print("2. Registering User A...")
    res_a = req('/api/auth/register', 'POST', {'name': 'Developer A', 'email': f'deva_{ts}@example.com', 'password': 'password123'})
    tok_a = res_a['access_token']
    print(f"User A registered: {res_a['user']['name']} (ID: {res_a['user']['id']})")

    print("3. Registering User B...")
    res_b = req('/api/auth/register', 'POST', {'name': 'Developer B', 'email': f'devb_{ts}@example.com', 'password': 'password123'})
    tok_b = res_b['access_token']
    print(f"User B registered: {res_b['user']['name']} (ID: {res_b['user']['id']})")

    print("4. User A creates Room...")
    room = req('/api/rooms', 'POST', {'name': 'Hackathon Demo Sprint'}, token=tok_a)
    code = room['room_code']
    print(f"Room created: Code={code}, Name='{room['name']}', Members={room['member_count']}")

    print("5. Checking initial files in Room...")
    files = req(f'/api/rooms/{code}/files', token=tok_a)
    print(f"Files count: {len(files)} -> {[f['name'] for f in files]}")

    print("6. User B joins Room...")
    joined = req(f'/api/rooms/{code}/join', 'POST', token=tok_b)
    print(f"User B joined. Total members: {joined['member_count']}")

    print("7. Executing Code...")
    run_res = req('/api/execute', 'POST', {'code': 'print("Hello from Sandboxed Python!")', 'language': 'python'}, token=tok_a)
    print(f"Execution Output: {run_res['output'].strip()}, Time: {run_res['execution_time']}s, Status: {run_res['status']}")

    print("8. Calling AI Assistant...")
    ai_res = req('/api/ai', 'POST', {'action': 'explain', 'code': 'def add(a, b):\n    return a + b', 'language': 'python'}, token=tok_a)
    print(f"AI Response Model: {ai_res['model_used']}, Action: {ai_res['action']}")

    print("\n*** ALL BACKEND CHECKS PASSED PERFECTLY! ***")

if __name__ == '__main__':
    main()
