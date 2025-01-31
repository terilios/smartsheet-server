from setuptools import setup, find_packages

setup(
    name="smartsheet_ops",
    version="0.1.0",
    description="Healthcare analytics operations for Smartsheet",
    author="Timothy Driscoll",
    author_email="timothy.driscoll@example.com",
    url="https://github.com/terilios/smartsheet-server",
    packages=find_packages(),
    install_requires=[
        'smartsheet-python-sdk>=2.0.0',
        'aiohttp>=3.8.0',
        'tiktoken>=0.5.0',
        'python-dotenv>=1.0.0',
        'openai>=1.0.0'
    ],
    entry_points={
        'console_scripts': [
            'smartsheet-ops=smartsheet_ops.cli:main',
        ],
    },
    python_requires='>=3.8',
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Healthcare Industry',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Programming Language :: Python :: 3.12',
        'Topic :: Scientific/Engineering :: Medical Science Apps.',
        'Topic :: Office/Business',
    ],
    keywords='smartsheet healthcare analytics pediatrics clinical-research',
)
