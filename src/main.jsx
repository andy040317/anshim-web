// 앱 시작점: index.html 의 <div id="root"> 에 App 을 그림
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// 화면을 그리다 오류가 나도 빈 화면 대신 안내를 보여줌
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (this.state.err) {
      return (
        <div className="boot">
          <b>화면을 그리다 오류가 났어요.</b>
          <span className="mono small">{String(this.state.err.message || this.state.err)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => this.setState({ err: null })}>다시 그리기</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// "처음부터 다시" 를 누르면 key 를 바꿔 App 을 새로 만듦
function Root() {
  const [k, setK] = useState(0);
  return <ErrorBoundary key={k}><App key={k} onReset={() => setK(x => x + 1)} /></ErrorBoundary>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
