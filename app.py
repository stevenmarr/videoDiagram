from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, extra_files=['templates/index.html', 'static/litegraph.js', 'static/litegraph.css'])