"""Logger 测试"""
import logging
from soloflow.logger import get_logger


class TestLogger:
    def test_get_logger(self):
        """测试获取 logger"""
        logger = get_logger("test")
        assert logger.name == "soloflow.test"
        assert logger.level == logging.INFO

    def test_logger_output(self, caplog):
        """测试日志输出"""
        logger = get_logger("output_test")
        with caplog.at_level(logging.INFO):
            logger.info("test message")
        assert "test message" in caplog.text
