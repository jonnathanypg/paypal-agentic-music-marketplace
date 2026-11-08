# -*- coding: utf-8 -*-
from slowapi import Limiter
from slowapi.util import get_remote_address

# Definimos el limitador global. 
# Usamos la IP remota como identificador por defecto.
limiter = Limiter(key_func=get_remote_address)
