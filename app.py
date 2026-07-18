"""
Signal — Student Operating System
Backend: Flask + Airtable API
"""
from flask import Flask, send_from_directory, request, jsonify, session, abort, redirect
import os, json, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.environ.get('SESSION_SECRET', 'change-this-in-production')

# ===== Config =====
AIRTABLE_TOKEN = os.environ.get('AIRTABLE_TOKEN', 'patBvlBjRp5RFa81G')
BASE_ID = 'appEJwrgrZIKUS0gh'
AIRTABLE_API = f'https://api.airtable.com/v0/{BASE_ID}'

# Shared fallback passcode
PASSCODE = os.environ.get('SIGNAL_PASSCODE', 'aleena2026')

# Per-family tokens
# Env format: SIGNAL_FAMILY_TOKENS=token1,token2,...
# Example: SIGNAL_FAMILY_TOKENS=I7)13.xZNC`
_raw_family_tokens = os.environ.get('SIGNAL_FAMILY_TOKENS', '')
VALID_FAMILY_TOKENS = {t.strip() for t in _raw_family_tokens.split(',') if t.strip()}


def _record_identity(record):
    try:
        return { 'id': record['id'], **record['fields'] }
    except Exception:
        return { 'id': record.get('id'), **record.get('fields', {}) }


def _airtable_get(path, params=None):
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


# ===== Static files =====
@app.route('/')
def landing():
    return send_from_directory('.', 'index.html')


@app.route('/login')
def login_page():
    return send_from_directory('.', 'login.html')


@app.route('/student')
def student_page():
    # Student access has moved to Airtable. This route is intentionally not public.
    # Remove only after confirming no embedded references remain.
    return redirect('/')


@app.route('/parent')
def parent_page():
    # Family-token mode: explicit link access
    token = request.args.get('family', '').strip()
    if VALID_FAMILY_TOKENS:
        if token and token in VALID_FAMILY_TOKENS:
            session['authenticated'] = True
            session['user_type'] = 'parent'
            session['family'] = token
        elif not session.get('authenticated') or session.get('user_type') != 'parent':
            return redirect('/login?next=/parent')
    else:
        # Passcode-only mode until family tokens are configured
        if not session.get('authenticated') or session.get('user_type') != 'parent':
            return redirect('/login?next=/parent')
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
    data = request.get_json(silent=True) or {}
    passcode = (data.get('passcode') or '').strip()
    user_type = (data.get('type') or '').strip()

    if not passcode or not user_type:
        return jsonify({'success': False, 'error': 'Missing passcode or view type'}), 400

    if passcode != PASSCODE:
        return jsonify({'success': False, 'error': 'Incorrect passcode'}), 401

    session['authenticated'] = True
    session['user_type'] = user_type
    return jsonify({'success': True, 'redirect': f'/{user_type}'})


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/check-auth')
def check_auth():
    if session.get('authenticated'):
        return jsonify({'authenticated': True, 'user_type': session.get('user_type')})
    return jsonify({'authenticated': False})


# ===== Parent data projection =====
def _parent_data_projection(records):
    students = []
    for r in records.get('students', {}).get('records', []):
        students.append(_record_identity(r))

    student = students[0] if students else {}
    student_name = student.get('Name') or 'your student'

    current_grades = []
    for r in records.get('students', {}).get('records', []):
        fields = r.get('fields', {}) or {}
        current_grades.append({
            'student': student_name,
            'overall': fields.get('Current average') or fields.get('Average') or fields.get('GPA'),
            'by_class': fields.get('Grades by class') or fields.get('Class grades') or fields.get('Grades'),
        })

    next_key_dates = []
    for r in records.get('tests', {}).get('records', []):
        fields = r.get('fields', {}) or {}
        if fields.get('Date'):
            next_key_dates.append({
                'label': fields.get('Test type') or fields.get('Label') or 'Test',
                'date': fields.get('Date'),
            })
    for r in records.get('assignments', {}).get('records', []):
        fields = r.get('fields', {}) or {}
        if fields.get('Due date') and (fields.get('Status') or '').lower() not in {'submitted', 'graded'}:
            next_key_dates.append({
                'label': fields.get('Assignment') or 'Assignment',
                'date': fields.get('Due date'),
            })
    next_key_dates.sort(key=lambda x: x.get('date') or '')

    summaries = records.get('summaries', {}).get('records', [])
    latest_summary = None
    for r in sorted(summaries, key=lambda x: x.get('fields', {}).get('Week End', ''), reverse=True):
        fields = r.get('fields', {}) or {}
        if fields.get('Status') == 'Sent':
            latest_summary = fields
            break

    invoices_paid = []
    for r in records.get('sessions', {}).get('records', []):
        fields = r.get('fields', {}) or {}
        invoices_paid.append({
            'session': fields.get('Session') or 'Session',
            'date': fields.get('Date'),
            'status': fields.get('Payment status') or fields.get('Status') or '',
        })

    return {
        'student': student_name,
        'currentGrades': current_grades,
        'nextKeyDates': next_key_dates[:5],
        'latestWeeklyNote': latest_summary or {},
        'invoicesPaid': invoices_paid[-4:],
    }


# ===== API endpoints =====
@app.route('/api/student/data')
def student_data():
    if not session.get('authenticated'):
        return jsonify({'error': 'Not authenticated'}), 401

    data = {
        'students': _airtable_get('tblUgck3y35PyvSYE'),
        'assignments': _airtable_get('tblqqgBoxBaOLCunS'),
        'tests': _airtable_get('tblbfXu7N07k6zAkn'),
        'drills': _airtable_get('tblYPo2NUGqsBH2av'),
        'sessions': _airtable_get('tblaXhuQOoAMCbnjC'),
        'mastery': _airtable_get('tblZxdUocawOVTupS'),
    }
    return jsonify(data)


@app.route('/api/parent/data')
def parent_data():
    if not session.get('authenticated'):
        return jsonify({'error': 'Not authenticated'}), 401

    raw = {
        'students': _airtable_get('tblUgck3y35PyvSYE'),
        'assignments': _airtable_get('tblqqgBoxBaOLCunS'),
        'tests': _airtable_get('tblbfXu7N07k6zAkn'),
        'sessions': _airtable_get('tblaXhuQOoAMCbnjC'),
        'summaries': _airtable_get('tblNslo0C76CuC2WI'),
    }

    projected = _parent_data_projection(raw)
    return jsonify({ 'ok': True, 'data': projected })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5173)
