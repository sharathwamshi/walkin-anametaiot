-- AnametaIoT Walk-in Drive Console — MySQL schema
-- Generated directly from the SQLAlchemy models (app/models/models.py)
-- For a brand-new database: mysql -u <user> -p walkin_drive < schema.sql
-- For an EXISTING database, use the migration_*.sql files instead.

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE events (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(150) NOT NULL, 
	description TEXT, 
	venue VARCHAR(200), 
	drive_date DATE, 
	status VARCHAR(20), 
	standee_token VARCHAR(64), 
	created_at DATETIME, 
	registration_form_config_json TEXT, 
	PRIMARY KEY (id), 
	UNIQUE (standee_token)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	whatsapp_enabled BOOL, 
	twilio_account_sid VARCHAR(200), 
	twilio_auth_token VARCHAR(200), 
	twilio_whatsapp_from VARCHAR(50), 
	smtp_host VARCHAR(150), 
	smtp_port INTEGER, 
	smtp_user VARCHAR(150), 
	smtp_password VARCHAR(200), 
	smtp_from_name VARCHAR(150), 
	public_base_url VARCHAR(200), 
	dry_run VARCHAR(10), 
	max_tab_violations INTEGER, 
	updated_at DATETIME, 
	PRIMARY KEY (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE candidates (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	unique_id VARCHAR(20), 
	event_id INTEGER NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	email VARCHAR(150), 
	phone VARCHAR(20) NOT NULL, 
	college VARCHAR(200), 
	branch VARCHAR(100), 
	cgpa VARCHAR(20), 
	passout_year VARCHAR(10), 
	resume_link VARCHAR(300), 
	source VARCHAR(20), 
	qr_path VARCHAR(300), 
	qr_send_status VARCHAR(20), 
	qr_send_error TEXT, 
	qr_sent_at DATETIME, 
	checked_in BOOL, 
	checked_in_at DATETIME, 
	welcome_sent BOOL, 
	registered_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(event_id) REFERENCES events (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE test_levels (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	event_id INTEGER NOT NULL, 
	level_number INTEGER NOT NULL, 
	name VARCHAR(150) NOT NULL, 
	test_type VARCHAR(30), 
	duration_minutes INTEGER, 
	cutoff_score FLOAT, 
	status VARCHAR(20), 
	started_at DATETIME, 
	completed_at DATETIME, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(event_id) REFERENCES events (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE candidate_level_results (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	candidate_id INTEGER NOT NULL, 
	test_level_id INTEGER NOT NULL, 
	score FLOAT, 
	max_score FLOAT, 
	passed BOOL, 
	selected_for_next BOOL, 
	next_level_invite_sent BOOL, 
	decided_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (id), 
	FOREIGN KEY(test_level_id) REFERENCES test_levels (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE candidate_test_sessions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	candidate_id INTEGER NOT NULL, 
	test_level_id INTEGER NOT NULL, 
	status VARCHAR(20), 
	start_time DATETIME, 
	end_time DATETIME, 
	score FLOAT, 
	tab_violation_count INTEGER, 
	is_flagged BOOL, 
	admin_reset_count INTEGER, 
	last_heartbeat DATETIME, 
	session_token VARCHAR(64), 
	interviewed_by VARCHAR(50), 
	PRIMARY KEY (id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (id), 
	FOREIGN KEY(test_level_id) REFERENCES test_levels (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE message_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	candidate_id INTEGER NOT NULL, 
	channel VARCHAR(20), 
	msg_type VARCHAR(30), 
	status VARCHAR(20), 
	error TEXT, 
	sent_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	test_level_id INTEGER NOT NULL, 
	question_text TEXT NOT NULL, 
	option_a VARCHAR(500), 
	option_b VARCHAR(500), 
	option_c VARCHAR(500), 
	option_d VARCHAR(500), 
	correct_option VARCHAR(1), 
	marks FLOAT, 
	negative_marks FLOAT, 
	order_index INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(test_level_id) REFERENCES test_levels (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE candidate_answers (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	session_id INTEGER NOT NULL, 
	question_id INTEGER NOT NULL, 
	selected_option VARCHAR(1), 
	is_correct BOOL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES candidate_test_sessions (id), 
	FOREIGN KEY(question_id) REFERENCES questions (id)
)
ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
