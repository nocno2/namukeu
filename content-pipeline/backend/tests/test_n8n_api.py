"""n8n API 엔드포인트 구조 테스트"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from src.main import create_app
from src.config import Config


@pytest.fixture
def client():
    config = Config(agent_enabled=False)
    app = create_app(config)
    return TestClient(app)


def test_health_check(client):
    """헬스체크 엔드포인트"""
    response = client.get("/api/n8n/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "content-pipeline-n8n"


@patch("src.api.n8n._run_claude_cli")
def test_generate_endpoint_structure(mock_claude, client):
    """Generate API 구조 테스트 (Claude CLI mock)"""
    # Mock Claude CLI responses
    mock_claude.side_effect = [
        "# 테스트 제목\n아웃라인 내용",  # outline
        "## 서론\n본문 내용...",  # article
        '{"slug": "test-slug", "excerpt": "요약", "tags": ["태그1", "태그2"]}',  # meta
    ]

    response = client.post("/api/n8n/generate", json={
        "keyword": "테스트 키워드",
        "direction": "테스트 방향"
    })

    assert response.status_code == 200
    data = response.json()
    assert "title" in data
    assert "slug" in data
    assert "content" in data
    assert "excerpt" in data
    assert "tags" in data
    assert "keyword" in data
    assert data["keyword"] == "테스트 키워드"


@patch("src.api.n8n.calculate_seo_score")
@patch("src.api.n8n.calculate_readability")
@patch("src.api.n8n.ai_review")
def test_review_endpoint_structure(mock_ai_review, mock_readability, mock_seo, client):
    """Review API 구조 테스트"""
    mock_seo.return_value = {"score": 8.5, "checks": {}, "word_count": 1000}
    mock_readability.return_value = {"score": 7.5, "sentence_count": 50}
    mock_ai_review.return_value = {"overall": 8, "scores": {}}

    response = client.post("/api/n8n/review", json={
        "title": "테스트 제목",
        "content": "테스트 본문 " * 100,
        "keyword": "테스트"
    })

    assert response.status_code == 200
    data = response.json()
    assert "seo" in data
    assert "readability" in data
    assert "ai_review" in data


@patch("src.api.n8n._run_claude_cli")
def test_revise_endpoint_structure(mock_claude, client):
    """Revise API 구조 테스트 (Claude CLI mock)"""
    mock_claude.side_effect = [
        "## 첨삭된 서론\n개선된 본문...",  # revised content
        "- 주요 변경 1\n- 주요 변경 2",  # changes summary
    ]

    response = client.post("/api/n8n/revise", json={
        "title": "테스트 제목",
        "content": "원본 본문 " * 50,
        "keyword": "테스트",
        "feedback": "더 전문적으로"
    })

    assert response.status_code == 200
    data = response.json()
    assert "revised_content" in data
    assert "changes_summary" in data


def test_generate_validation(client):
    """Generate API 필수 필드 검증"""
    # keyword 누락
    response = client.post("/api/n8n/generate", json={})
    assert response.status_code == 422

    # keyword 너무 짧음
    response = client.post("/api/n8n/generate", json={"keyword": ""})
    assert response.status_code == 422


def test_review_validation(client):
    """Review API 필수 필드 검증"""
    # title, content, keyword 모두 필수
    response = client.post("/api/n8n/review", json={"title": "제목만"})
    assert response.status_code == 422
