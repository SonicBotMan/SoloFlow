"""
SoloFlow 统一日日志模块
"""
import logging
import sys


def get_logger(name: str) -> logging.Logger:
    """获取统一格式的 logger"""
    logger = logging.getLogger(f"soloflow.{name}")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        formatter = logging.Formatter(
            "%(asctime)s [%(name)s] %(levelname)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger
