"""
Signal — Student Operating System
Backend: Flask + Airtable API
"""
from flask import Flask, send_from_directory, request, jsonify, session
import os, json, urllib.request, urllib.error
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SESSION_SECRET', 'change-this-in-production')

# ===== Config =====
AIRTABLE_TOKEN = os.environ.get('AIRTABLE_TOKEN', 'patBvlBjRp5RFa81G')  # move to .env
BASE_ID = 'appEJwrgrZIKUS0gh'
AIRTABLE_API = f'https://api.airtable.com/v0/{BASE_ID}'

# Shared passcode (change this)
PASSCODE = os.environ.get('SIGNAL_PASSCODE', 'aleena2026')

# ===== Static files =====
@app.route('/')
def landing():
    return send_from_directory('.', 'index.html')

@app.route('/login')
def login_page():
    return send_from_directory('.', 'login.html')

@app.route('/student')
def student_page():
    return send_from_directory('.', 'student.html')

@app.route('/parent')
def parent_page():
    return send_from_directory('.', 'parent.html')

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

# ===== Auth =====
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    passcode = data.get('passcode', '').strip()
    user_type = data.get('type', '')  # 'student' or 'parent'

    if passcode == PASSCODE:
        session['authenticated'] = True
        session['user_type'] = user_type
        return jsonify({'success': True, 'redirect': f'/{user_type}'})
    else:
        return jsonify({'success': False, 'error': 'Incorrect passcode'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/check-auth')
def check_auth():
    if session.get('authenticated'):
        return jsonify({'authenticated': True, 'user_type': session.get('user_type')})
    return jsonify({'authenticated': False})

# ===== Airtable helpers =====
def airtable_get(path, params=None):
    url = f'{AIRTABLE_API}/{path}'
    if params:
        qs = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items())
        url += f'?{qs}'
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {AIRTABLE_TOKEN}',
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Airtable error: {e.code} {e.read().decode()[:200]}")
        return {'error': str(e)}

# ===== API endpoints =====
@app.route('/api/student/data')
def student_data():
    # Return all data needed for the student dashboard
    if not session.get('authenticated'):
        return jsonify({'error': 'Not authenticated'}), 401

    student_id = 'rec...'  # In production, pass via query param or session
    # For now, return all data - filter in JS
    
    data = {
        'students': airtable_get('tblUgck3y35PyvSYE'),
        'assignments': airtable_get('tblqqgBoxBaOLCunS'),
        'tests': airtable_get('tblbfXu7N07k6zAkn'),
        'drills': airtable_get('tblYPo2NUGqsBH2av'),
        'sessions': airtable_get('tblaXhuQOoAMCbnjC'),
        'mastery': airtable_get('tblZxdUocawOVTupS'),
    }
    return jsonify(data)

@app.route('/api/parent/data')
def parent_data():
    if not session.get('authenticated'):
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = {
        'students': airtable_get('tblUgck3y35PyvSYE'),
        'assignments': airtable_get('tblqqgBoxBaOLCunS'),
        'sessions': airtable_get('tblaXhuQOoAMCbnjC'),
        'tests': airtable_get('tblbfXu7N07k6zAkn'),
        'summaries': airtable_get('tblNslo0C76CuC2WI'),
    }
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5173)
