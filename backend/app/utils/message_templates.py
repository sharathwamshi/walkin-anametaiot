"""
Central place for every candidate-facing message. Keeping copy here (instead of
scattered inline strings) makes it easy for the admin/HR team to edit tone and
wording without touching route logic.
"""


def qr_invite_whatsapp(candidate, event):
    return (
        f"Hi {candidate.name}, you're registered for the *{event.name}* walk-in drive "
        f"at {event.venue or 'the venue'} on {event.drive_date or 'the scheduled date'}.\n\n"
        f"Your Candidate ID: *{candidate.unique_id}*\n"
        f"Please save this ID and show the attached QR code at the front desk on arrival.\n\n"
        f"— AnametaIoT Talent Acquisition"
    )


def qr_invite_email_html(candidate, event, qr_cid_name=None):
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#1450A3;padding:20px 28px;color:#fff">
        <h2 style="margin:0;font-weight:600">AnametaIoT Walk-in Drive</h2>
      </div>
      <div style="padding:24px 28px">
        <p>Hi <b>{candidate.name}</b>,</p>
        <p>You are registered for <b>{event.name}</b>{' at ' + event.venue if event.venue else ''}
        {' on ' + str(event.drive_date) if event.drive_date else ''}.</p>
        <p>Your Candidate ID: <span style="background:#FFF3E8;color:#E86A17;padding:4px 10px;border-radius:6px;font-weight:700">{candidate.unique_id}</span></p>
        <p>Please save this ID and bring the attached QR code (digital or printed) to the front desk.</p>
        <p style="margin-top:24px;color:#888;font-size:13px">Powered by +veGroww</p>
      </div>
    </div>
    """


def welcome_whatsapp(candidate, event):
    return (
        f"Welcome {candidate.name}! 🎉\n\n"
        f"Thank you for checking in at the *{event.name}* walk-in drive. "
        f"Our team will guide you through the next steps shortly. All the best!\n\n"
        f"— AnametaIoT Talent Acquisition"
    )


def welcome_email_html(candidate, event):
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#E86A17;padding:20px 28px;color:#fff">
        <h2 style="margin:0;font-weight:600">Welcome, {candidate.name}!</h2>
      </div>
      <div style="padding:24px 28px">
        <p>Thanks for checking in at <b>{event.name}</b>. We're glad you're here.</p>
        <p>Please stay near the seating area — our team will call you for the next round shortly.</p>
        <p style="margin-top:24px;color:#888;font-size:13px">Powered by +veGroww</p>
      </div>
    </div>
    """


def test_invite_whatsapp(candidate, level, entry_url):
    return (
        f"Hi {candidate.name}, Round {level.level_number} — *{level.name}* "
        f"({level.test_type.title()}) is starting now.\n\n"
        f"Duration: {level.duration_minutes} minutes\n"
        f"Your Candidate ID: *{candidate.unique_id}*\n"
        f"Start here: {entry_url}\n\n"
        f"Keep the test tab open until you finish — switching tabs will flag your attempt.\n"
        f"— AnametaIoT Talent Acquisition"
    )


def test_invite_email_html(candidate, level, entry_url):
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#1450A3;padding:20px 28px;color:#fff">
        <h2 style="margin:0;font-weight:600">Round {level.level_number}: {level.name}</h2>
      </div>
      <div style="padding:24px 28px">
        <p>Hi <b>{candidate.name}</b>,</p>
        <p>Your {level.test_type} assessment is now open. Duration: <b>{level.duration_minutes} minutes</b>.</p>
        <p>Your Candidate ID: <span style="background:#FFF3E8;color:#E86A17;padding:4px 10px;border-radius:6px;font-weight:700">{candidate.unique_id}</span></p>
        <p><a href="{entry_url}" style="background:#E86A17;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Start Assessment</a></p>
        <p style="color:#c0392b;font-size:13px">Important: do not close or switch away from the test tab once started.</p>
        <p style="margin-top:24px;color:#888;font-size:13px">Powered by +veGroww</p>
      </div>
    </div>
    """


def next_level_whatsapp(candidate, next_level):
    return (
        f"Congratulations {candidate.name}! 🎉 You've cleared the previous round.\n\n"
        f"You're invited to Round {next_level.level_number}: *{next_level.name}*.\n"
        f"We'll share the assessment link shortly. All the best!\n\n"
        f"— AnametaIoT Talent Acquisition"
    )


def next_level_email_html(candidate, next_level):
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#1BA672;padding:20px 28px;color:#fff">
        <h2 style="margin:0;font-weight:600">Congratulations, {candidate.name}!</h2>
      </div>
      <div style="padding:24px 28px">
        <p>You've cleared the previous round and are invited to <b>Round {next_level.level_number}: {next_level.name}</b>.</p>
        <p>Keep an eye on WhatsApp/Email — the assessment link will follow shortly.</p>
        <p style="margin-top:24px;color:#888;font-size:13px">Powered by +veGroww</p>
      </div>
    </div>
    """


def final_selection_whatsapp(candidate, results_url):
    return (
        f"Congratulations {candidate.name}! 🎉 You have been *selected*.\n\n"
        f"View the full results list here: {results_url}\n"
        f"Our HR team will reach out with the next steps.\n\n"
        f"— AnametaIoT Talent Acquisition"
    )


def final_selection_email_html(candidate, results_url):
    return f"""
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#1BA672;padding:20px 28px;color:#fff">
        <h2 style="margin:0;font-weight:600">You've been selected, {candidate.name}!</h2>
      </div>
      <div style="padding:24px 28px">
        <p>Congratulations on making it through the walk-in drive.</p>
        <p><a href="{results_url}" style="background:#1450A3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">View Results</a></p>
        <p style="margin-top:24px;color:#888;font-size:13px">Powered by +veGroww</p>
      </div>
    </div>
    """
