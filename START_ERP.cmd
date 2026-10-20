@echo off
chcp 65001 > nul
title Zeralda ERP
cd /d "%~dp0"
call zeralda.cmd run
