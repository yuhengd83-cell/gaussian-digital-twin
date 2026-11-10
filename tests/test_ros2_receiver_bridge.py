"""Network and serialization tests that do not require ROS2 installed."""
import asyncio
import importlib.util
import json
from pathlib import Path
import pytest
from websockets.asyncio.server import serve
from websockets.asyncio.client import connect

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ros2_receiver_bridge', ROOT/'tools/ros2_receiver_bridge.py')
mod=importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name]=mod
spec.loader.exec_module(mod)


def test_image_payload_is_summarized():
    class FakeImage:
        def get_fields_and_field_types(self):
            return {'width':'uint32','height':'uint32','data':'sequence<uint8>'}
        width=1920
        height=1080
        data=bytearray(1920*1080*3)
    summarized=mod._safe_value(FakeImage())
    assert summarized['width']==1920
    assert summarized['data']=={'bytes_omitted':1920*1080*3}


def test_demo_roundtrip():
    async def run():
        bridge=mod.ReceiverServer(mod.DemoGraph(),'secret',True)
        bridge.loop=asyncio.get_running_loop()
        async with serve(bridge.handle,'127.0.0.1',0) as server:
            port=server.sockets[0].getsockname()[1]
            async with connect(f'ws://127.0.0.1:{port}') as ws:
                await ws.send(json.dumps({'op':'hello','protocol':mod.PROTOCOL,'token':'secret'}))
                hello=json.loads(await asyncio.wait_for(ws.recv(),2))
                graph=json.loads(await asyncio.wait_for(ws.recv(),2))
                assert hello['op']=='hello' and hello['source']=='DEMO' and hello['readonly'] is True
                assert graph['op']=='graph' and len(graph['topics'])==4 and len(graph['nodes'])==3
                topics=['/demo/odometry','/demo/gnss/fix']
                await ws.send(json.dumps({'op':'subscribe','topics':topics}))
                ack=json.loads(await asyncio.wait_for(ws.recv(),2))
                assert ack['op']=='subscribe_result' and sum(r['ok'] for r in ack['results'])==2
                for name in topics:
                    bridge.broadcast_preview(name,bridge.source.publishers[name],{'data':'DEMO TEST'})
                out=[json.loads(await asyncio.wait_for(ws.recv(),2)) for _ in topics]
                assert {x['topic'] for x in out}==set(topics)
                assert all(x['source']=='DEMO' for x in out)
                await ws.send(json.dumps({'op':'unsubscribe','topics':'all'}))
                reply=json.loads(await asyncio.wait_for(ws.recv(),2))
                assert reply['op']=='unsubscribe_result' and not reply['active']
            assert not bridge.topic_types
    asyncio.run(run())


def test_unauthorized_token_blocks_subscription():
    async def run():
        bridge=mod.ReceiverServer(mod.DemoGraph(),'correct-token',True)
        bridge.loop=asyncio.get_running_loop()
        async with serve(bridge.handle,'127.0.0.1',0) as server:
            port=server.sockets[0].getsockname()[1]
            async with connect(f'ws://127.0.0.1:{port}') as ws:
                await ws.send(json.dumps({'op':'hello','protocol':mod.PROTOCOL,'token':'wrong-token'}))
                try:
                    await asyncio.wait_for(ws.recv(),2)
                except Exception:
                    pass
            assert not bridge.topic_types
    asyncio.run(run())
