import urllib.request
import json
import time

BASE_HTTP = 'http://127.0.0.1:8000'

def http_post(path, data, token=None):
    url = BASE_HTTP + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req_obj = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers=headers,
        method='POST'
    )
    with urllib.request.urlopen(req_obj) as res:
        return json.loads(res.read().decode())

def run_tests():
    # 1. Register test user
    ts = int(time.time() * 1000)
    auth_res = http_post('/api/auth/register', {
        'name': 'Language Tester',
        'email': f'lang_tester_{ts}@example.com',
        'password': 'password123'
    })
    token = auth_res['access_token']

    test_cases = [
        ('Python', 'python', 'print("Python 3 Execution OK")', 'Python 3 Execution OK'),
        ('JavaScript', 'javascript', 'console.log("JavaScript Node Execution OK");', 'JavaScript Node Execution OK'),
        ('TypeScript', 'typescript', 'const msg: string = "TypeScript Execution OK"; console.log(msg);', 'TypeScript Execution OK'),
        ('C', 'c', '#include <stdio.h>\nint main() { printf("C Execution OK\\n"); return 0; }', 'C Execution OK'),
        ('C++', 'cpp', '#include <iostream>\nint main() { std::cout << "C++ Execution OK" << std::endl; return 0; }', 'C++ Execution OK'),
        ('Java', 'java', 'public class Main { public static void main(String[] args) { System.out.println("Java Execution OK"); } }', 'Java Execution OK'),
        ('Go', 'go', 'package main\nimport "fmt"\nfunc main() { fmt.Println("Go Execution OK") }', 'Go Execution OK'),
        ('Rust', 'rust', 'fn main() { println!("Rust Execution OK"); }', 'Rust Execution OK'),
        ('PHP', 'php', '<?php echo "PHP Execution OK\\n"; ?>', 'PHP Execution OK'),
        ('Ruby', 'ruby', 'puts "Ruby Execution OK"', 'Ruby Execution OK'),
    ]

    print("==================================================")
    print("TESTING ALL 10 COMPILER / RUNTIME SANDBOXES")
    print("==================================================")

    for name, lang, code, expected in test_cases:
        res = http_post('/api/execute', {'code': code, 'language': lang}, token=token)
        status = res['status']
        out = res['output'].strip()
        elapsed = res['execution_time']
        matched = expected in out
        print(f"[{'PASS' if matched else 'FAIL'}] {name:12} | Status: {status:7} | Time: {elapsed}s | Output: {out}")
        assert matched, f"{name} output failed to match expected string"

    print("\n--- Testing Multi-File Project Execution ---")
    multi_res = http_post('/api/execute', {
        'files': [
            {'name': 'main.py', 'content': 'import helper\nprint(helper.calc(10, 5))'},
            {'name': 'helper.py', 'content': 'def calc(a, b): return f"Calc Result: {a * b}"'}
        ],
        'entry_file': 'main.py',
        'language': 'python'
    }, token=token)
    print(f"[PASS] Multi-file Python | Status: {multi_res['status']} | Output: {multi_res['output'].strip()}")
    assert "Calc Result: 50" in multi_res['output']

    print("\n--- Testing Runtime Error Sanitization ---")
    err_res = http_post('/api/execute', {
        'code': 'def divide(): return 1 / 0\ndivide()',
        'language': 'python'
    }, token=token)
    print(f"[PASS] Runtime Error | Status: {err_res['status']} | Output: {err_res['output'].strip()}")
    assert "ZeroDivisionError" in err_res['output']
    assert "codespace_" not in err_res['output'], "Internal temporary directory leaked"

    print("\n--- Testing Compilation Error Handling ---")
    comp_res = http_post('/api/execute', {
        'code': '#include <stdio.h>\nint main() { printf(SYNTAX_ERROR) }',
        'language': 'c'
    }, token=token)
    print(f"[PASS] C Compilation Error | Status: {comp_res['status']} | Output: {comp_res['output'].strip()}")
    assert comp_res['status'] == 'error'
    assert "error:" in comp_res['output'].lower()

    print("\n--- Testing Timeout Enforcement ---")
    timeout_res = http_post('/api/execute', {
        'code': 'import time\ntime.sleep(15)',
        'language': 'python'
    }, token=token)
    print(f"[PASS] Timeout Enforcement | Status: {timeout_res['status']} | Output: {timeout_res['output'].strip()}")
    assert timeout_res['status'] == 'timeout'

    print("\n==================================================")
    print("ALL 10 TARGET LANGUAGES & EXECUTION SCENARIOS PASSED!")
    print("==================================================")

if __name__ == '__main__':
    run_tests()
