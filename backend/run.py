import click
from app import create_app
from app.extensions import db

app = create_app()


@app.cli.command("init-db")
def init_db():
    """Create all tables: flask --app run.py init-db"""
    with app.app_context():
        db.create_all()
    click.echo("Database tables created.")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
