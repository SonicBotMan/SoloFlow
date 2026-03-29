"""OpenClaw Driver 测试"""
import pytest
from soloflow.drivers.openclaw_driver import OpenClawDriver


class TestOpenClawDriver:
    def test_init(self):
        """测试初始化"""
        driver = OpenClawDriver({
            "endpoint": "http://localhost:18210",
            "api_key": "test-key",
            "timeout": 30
        })
        assert driver.endpoint == "http://localhost:18210"
        assert driver.api_key == "test-key"
        assert driver.timeout == 30

    def test_default_config(self):
        """测试默认配置"""
        driver = OpenClawDriver({})
        assert driver.endpoint == "http://localhost:18210"
        assert driver.api_key == ""
        assert driver.timeout == 120
