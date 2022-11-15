"use strict";
import mongodb from 'mongodb';
import promClient from 'prom-client';
import promBundle from 'express-prom-bundle';
import express from 'express';
import run from '../shared/runner.js';
import pkg from './package.json' assert {type: 'json'};

run({
  mongodb,
  promClient,
  promBundle,
  express,
  pkg,
});
