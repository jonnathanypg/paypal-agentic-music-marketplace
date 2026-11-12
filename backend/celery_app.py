# -*- coding: utf-8 -*-
"""Minimal Celery instance for the standalone PayPal Agentic Music Marketplace.

The hosted production deployment shares MediaSuite's full Celery app, but the
public repository only needs a valid `celery_app` object for the PayPal
e-commerce router to import and run locally. Heavy MediaSuite tasks are not
part of this repository.
"""

from celery import Celery

from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery_app = Celery(
    "paypal_agentic_music_marketplace",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
    result_extended=True,
)
